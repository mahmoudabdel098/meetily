//! Telling the local user apart from the other call participants.
//!
//! The app captures the microphone and the system (call) audio separately and
//! mixes them before speech detection. While mixing, it records the energy
//! of both streams per window and keeps the recent call audio. For each
//! detected speech segment we then compare how much energy came from each
//! stream: mostly microphone means the local user spoke, mostly system audio
//! means a remote participant did (and their audio is extracted for speaker
//! identification).

use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// The local user (microphone)
    Local,
    /// Someone in the call (system audio)
    Remote,
}

/// The microphone must carry this many times the call-audio energy for a
/// segment to count as the local user (robust to speaker bleed into the mic).
const LOCAL_ENERGY_RATIO: f64 = 2.0;
/// Below this mean energy per sample, the call audio counts as silent
const SILENCE_ENERGY: f64 = 1e-7;

#[derive(Debug, Clone, Copy)]
struct Window {
    start_ms: f64,
    end_ms: f64,
    mic_energy: f64,
    system_energy: f64,
}

/// Per-window energies of both streams plus the recent call audio,
/// on the same timeline as the speech detector (ms since recording start).
pub struct EnergyTimeline {
    sample_rate: u32,
    retention_ms: f64,
    windows: VecDeque<Window>,
    /// Recent system audio at `sample_rate`, first sample at `system_start_sample`
    system_audio: VecDeque<f32>,
    system_start_sample: u64,
    total_samples: u64,
}

fn energy(samples: &[f32]) -> f64 {
    samples.iter().map(|&s| (s as f64) * (s as f64)).sum()
}

impl EnergyTimeline {
    /// `retention_ms` bounds memory: segments older than that can no longer be analysed.
    pub fn new(sample_rate: u32, retention_ms: f64) -> Self {
        Self {
            sample_rate,
            retention_ms,
            windows: VecDeque::new(),
            system_audio: VecDeque::new(),
            system_start_sample: 0,
            total_samples: 0,
        }
    }

    fn samples_to_ms(&self, samples: u64) -> f64 {
        samples as f64 * 1000.0 / self.sample_rate as f64
    }

    /// Records one mixing window (both slices cover the same time span).
    pub fn push(&mut self, mic: &[f32], system: &[f32]) {
        let len = mic.len().max(system.len()) as u64;
        if len == 0 {
            return;
        }
        let start_ms = self.samples_to_ms(self.total_samples);
        self.total_samples += len;
        let end_ms = self.samples_to_ms(self.total_samples);
        self.windows.push_back(Window {
            start_ms,
            end_ms,
            mic_energy: energy(mic),
            system_energy: energy(system),
        });

        self.system_audio.extend(system.iter().copied());
        // Keep the system stream aligned with the timeline when it is shorter
        self.system_audio
            .extend(std::iter::repeat(0.0).take(len as usize - system.len()));

        let max_samples = (self.retention_ms * self.sample_rate as f64 / 1000.0) as usize;
        while self.system_audio.len() > max_samples {
            self.system_audio.pop_front();
            self.system_start_sample += 1;
        }
        while self
            .windows
            .front()
            .is_some_and(|w| end_ms - w.end_ms > self.retention_ms)
        {
            self.windows.pop_front();
        }
    }

    /// Who produced the speech between `start_ms` and `end_ms`.
    pub fn attribute(&self, start_ms: f64, end_ms: f64) -> Source {
        let (mut mic, mut system, mut samples) = (0.0, 0.0, 0.0);
        for w in &self.windows {
            let overlap = end_ms.min(w.end_ms) - start_ms.max(w.start_ms);
            if overlap <= 0.0 {
                continue;
            }
            let fraction = overlap / (w.end_ms - w.start_ms);
            mic += w.mic_energy * fraction;
            system += w.system_energy * fraction;
            samples += (w.end_ms - w.start_ms) * fraction * self.sample_rate as f64 / 1000.0;
        }
        if samples == 0.0 || system / samples < SILENCE_ENERGY || mic > system * LOCAL_ENERGY_RATIO {
            Source::Local
        } else {
            Source::Remote
        }
    }

    /// Call audio between `start_ms` and `end_ms` at the capture sample rate
    /// (empty if it is no longer retained).
    pub fn system_audio(&self, start_ms: f64, end_ms: f64) -> Vec<f32> {
        let to_sample = |ms: f64| (ms.max(0.0) * self.sample_rate as f64 / 1000.0) as u64;
        let first = to_sample(start_ms).max(self.system_start_sample);
        let last = to_sample(end_ms).min(self.system_start_sample + self.system_audio.len() as u64);
        if last <= first {
            return Vec::new();
        }
        let from = (first - self.system_start_sample) as usize;
        let to = (last - self.system_start_sample) as usize;
        self.system_audio.range(from..to).copied().collect()
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(len: usize, amp: f32) -> Vec<f32> {
        (0..len).map(|i| (i as f32 * 0.1).sin() * amp).collect()
    }

    #[test]
    fn attributes_by_dominant_stream() {
        // 1 kHz timeline, 100 ms windows
        let mut t = EnergyTimeline::new(1000, 60_000.0);
        t.push(&tone(100, 0.5), &tone(100, 0.0)); // 0-100 ms: you
        t.push(&tone(100, 0.02), &tone(100, 0.4)); // 100-200 ms: remote, faint bleed in mic
        t.push(&tone(100, 0.3), &tone(100, 0.3)); // 200-300 ms: overlap
        assert_eq!(t.attribute(0.0, 100.0), Source::Local);
        assert_eq!(t.attribute(100.0, 200.0), Source::Remote);
        assert_eq!(t.attribute(200.0, 300.0), Source::Remote);
        assert_eq!(t.attribute(500.0, 600.0), Source::Local); // unknown time: default to local
    }

    #[test]
    fn extracts_and_bounds_system_audio() {
        let mut t = EnergyTimeline::new(1000, 250.0);
        for i in 0..5 {
            t.push(&[0.0; 100], &vec![i as f32; 100]);
        }
        // Only the last 250 ms are kept
        assert!(t.system_audio(0.0, 100.0).is_empty());
        let tail = t.system_audio(400.0, 500.0);
        assert_eq!(tail.len(), 100);
        assert!(tail.iter().all(|&s| s == 4.0));
        assert_eq!(t.system_audio(300.0, 450.0).len(), 150);
    }

    #[test]
    fn shorter_system_window_is_padded() {
        let mut t = EnergyTimeline::new(1000, 10_000.0);
        t.push(&[0.1; 100], &[0.5; 60]);
        t.push(&[0.1; 100], &[0.5; 100]);
        let audio = t.system_audio(0.0, 200.0);
        assert_eq!(audio.len(), 200);
        assert_eq!(audio[70], 0.0);
        assert_eq!(audio[150], 0.5);
    }
}
