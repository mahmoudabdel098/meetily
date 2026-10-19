//! Online speaker clustering.
//!
//! Each remote speech segment yields an L2-normalised embedding. A segment
//! joins the speaker whose centroid (duration-weighted mean of its segments)
//! is most similar; a new speaker is created only from segments long enough
//! to be reliable whose best similarity is below the threshold. Short
//! segments always join the closest existing speaker.
//!
//! Defaults were tuned on degraded (8 kHz band, noisy) speech with the
//! 3D-Speaker CAM++ model: same-speaker centroid similarity stays well above
//! 0.5 for segments of 2 s or more, different speakers stay below it.

#[derive(Debug, Clone, Copy)]
pub struct ClusterConfig {
    /// Below this cosine similarity to every centroid, a long segment starts a new speaker
    pub new_speaker_threshold: f32,
    /// Minimum segment length (seconds) allowed to create a new speaker
    pub min_new_speaker_secs: f32,
    /// Upper bound on distinct speakers (beyond it, segments join the closest one)
    pub max_speakers: usize,
}

impl Default for ClusterConfig {
    fn default() -> Self {
        Self {
            new_speaker_threshold: 0.5,
            min_new_speaker_secs: 2.0,
            max_speakers: 12,
        }
    }
}

struct Speaker {
    weighted_sum: Vec<f32>,
    centroid: Vec<f32>,
}

pub struct OnlineClusterer {
    config: ClusterConfig,
    speakers: Vec<Speaker>,
}

pub fn normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

impl OnlineClusterer {
    pub fn new(config: ClusterConfig) -> Self {
        Self { config, speakers: Vec::new() }
    }

    pub fn num_speakers(&self) -> usize {
        self.speakers.len()
    }

    pub fn reset(&mut self) {
        self.speakers.clear();
    }

    /// Assigns a segment to a speaker and returns its 0-based index.
    pub fn assign(&mut self, embedding: &[f32], duration_secs: f32) -> usize {
        let mut e = embedding.to_vec();
        normalize(&mut e);

        let best = self
            .speakers
            .iter()
            .enumerate()
            .map(|(i, s)| (i, dot(&s.centroid, &e)))
            .max_by(|a, b| a.1.total_cmp(&b.1));

        let create = match best {
            None => true,
            Some((_, similarity)) => {
                similarity < self.config.new_speaker_threshold
                    && duration_secs >= self.config.min_new_speaker_secs
                    && self.speakers.len() < self.config.max_speakers
            }
        };

        if create {
            let weight = duration_secs.max(0.1);
            self.speakers.push(Speaker {
                weighted_sum: e.iter().map(|x| x * weight).collect(),
                centroid: e,
            });
            return self.speakers.len() - 1;
        }

        let (index, _) = best.expect("checked above");
        let speaker = &mut self.speakers[index];
        let weight = duration_secs.max(0.1);
        for (sum, x) in speaker.weighted_sum.iter_mut().zip(&e) {
            *sum += x * weight;
        }
        speaker.centroid = speaker.weighted_sum.clone();
        normalize(&mut speaker.centroid);
        index
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit vector along `axis` with a little noise on another axis
    fn voice(axis: usize, noise_axis: usize, noise: f32) -> Vec<f32> {
        let mut v = vec![0.0; 8];
        v[axis] = 1.0;
        v[noise_axis] += noise;
        v
    }

    #[test]
    fn separates_distinct_voices() {
        let mut c = OnlineClusterer::new(ClusterConfig::default());
        assert_eq!(c.assign(&voice(0, 5, 0.1), 3.0), 0);
        assert_eq!(c.assign(&voice(1, 5, 0.1), 3.0), 1);
        assert_eq!(c.assign(&voice(0, 6, 0.2), 2.5), 0);
        assert_eq!(c.assign(&voice(2, 6, 0.1), 2.5), 2);
        assert_eq!(c.assign(&voice(1, 7, 0.3), 4.0), 1);
        assert_eq!(c.num_speakers(), 3);
    }

    #[test]
    fn short_segments_never_create_speakers() {
        let mut c = OnlineClusterer::new(ClusterConfig::default());
        c.assign(&voice(0, 5, 0.0), 3.0);
        // Unlike speaker 0, but too short to be trusted as a new voice
        assert_eq!(c.assign(&voice(3, 5, 0.0), 1.0), 0);
        assert_eq!(c.num_speakers(), 1);
    }

    #[test]
    fn respects_max_speakers() {
        let mut c = OnlineClusterer::new(ClusterConfig { max_speakers: 2, ..Default::default() });
        c.assign(&voice(0, 5, 0.0), 3.0);
        c.assign(&voice(1, 5, 0.0), 3.0);
        assert!(c.assign(&voice(2, 5, 0.0), 3.0) < 2);
        assert_eq!(c.num_speakers(), 2);
    }
}
