//! Kaldi-compatible log mel filterbank ("fbank") features.
//!
//! Matches the defaults speaker-embedding models are trained with
//! (kaldi-native-fbank / torchaudio.compliance.kaldi.fbank): 16 kHz audio,
//! 25 ms Povey windows every 10 ms, DC removal, 0.97 pre-emphasis, 512-point
//! FFT power spectrum, 80 mel bins from 20 Hz to Nyquist, natural log, no
//! dither, `snip_edges = true`.

use realfft::{RealFftPlanner, RealToComplex};
use std::sync::Arc;

pub const SAMPLE_RATE: usize = 16_000;
pub const NUM_MEL_BINS: usize = 80;
const FRAME_LENGTH: usize = 400; // 25 ms
const FRAME_SHIFT: usize = 160; // 10 ms
const FFT_SIZE: usize = 512;
const PREEMPHASIS: f64 = 0.97;
const LOW_FREQ: f64 = 20.0;

fn mel_scale(freq: f64) -> f64 {
    1127.0 * (1.0 + freq / 700.0).ln()
}

pub struct Fbank {
    window: Vec<f64>,
    /// Per mel bin: first FFT bin index and its triangular weights
    mel_banks: Vec<(usize, Vec<f64>)>,
    fft: Arc<dyn RealToComplex<f64>>,
}

impl Default for Fbank {
    fn default() -> Self {
        Self::new()
    }
}

impl Fbank {
    pub fn new() -> Self {
        let window = (0..FRAME_LENGTH)
            .map(|i| {
                let hann = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (FRAME_LENGTH - 1) as f64).cos();
                hann.powf(0.85)
            })
            .collect();

        let num_fft_bins = FFT_SIZE / 2;
        let bin_width = SAMPLE_RATE as f64 / FFT_SIZE as f64;
        let mel_low = mel_scale(LOW_FREQ);
        let mel_high = mel_scale(SAMPLE_RATE as f64 / 2.0);
        let delta = (mel_high - mel_low) / (NUM_MEL_BINS + 1) as f64;

        let mel_banks = (0..NUM_MEL_BINS)
            .map(|bin| {
                let left = mel_low + bin as f64 * delta;
                let center = left + delta;
                let right = center + delta;
                let mut first = None;
                let mut weights = Vec::new();
                for i in 0..num_fft_bins {
                    let mel = mel_scale(bin_width * i as f64);
                    if mel > left && mel < right {
                        let weight = if mel <= center {
                            (mel - left) / (center - left)
                        } else {
                            (right - mel) / (right - center)
                        };
                        first.get_or_insert(i);
                        weights.push(weight);
                    }
                }
                (first.unwrap_or(0), weights)
            })
            .collect();

        let fft = RealFftPlanner::<f64>::new().plan_fft_forward(FFT_SIZE);
        Self { window, mel_banks, fft }
    }

    /// Number of frames produced for `num_samples` input samples.
    pub fn num_frames(num_samples: usize) -> usize {
        if num_samples < FRAME_LENGTH {
            0
        } else {
            1 + (num_samples - FRAME_LENGTH) / FRAME_SHIFT
        }
    }

    /// Features for 16 kHz mono samples in [-1, 1], row-major `[frames][80]`,
    /// with the per-bin mean over all frames subtracted ("global-mean" CMN).
    pub fn compute(&self, samples: &[f32]) -> Vec<f32> {
        let frames = Self::num_frames(samples.len());
        let mut features = vec![0.0f32; frames * NUM_MEL_BINS];
        let mut input = self.fft.make_input_vec();
        let mut spectrum = self.fft.make_output_vec();
        let mut power = vec![0.0f64; FFT_SIZE / 2];

        for frame in 0..frames {
            let start = frame * FRAME_SHIFT;
            let chunk = &samples[start..start + FRAME_LENGTH];

            let mean = chunk.iter().map(|&s| s as f64).sum::<f64>() / FRAME_LENGTH as f64;
            let mut buf: Vec<f64> = chunk.iter().map(|&s| s as f64 - mean).collect();
            for i in (1..FRAME_LENGTH).rev() {
                buf[i] -= PREEMPHASIS * buf[i - 1];
            }
            buf[0] -= PREEMPHASIS * buf[0];

            input.iter_mut().for_each(|v| *v = 0.0);
            for i in 0..FRAME_LENGTH {
                input[i] = buf[i] * self.window[i];
            }
            self.fft
                .process(&mut input, &mut spectrum)
                .expect("FFT buffers have the planned sizes");
            for (p, c) in power.iter_mut().zip(spectrum.iter()) {
                *p = c.re * c.re + c.im * c.im;
            }

            let row = &mut features[frame * NUM_MEL_BINS..(frame + 1) * NUM_MEL_BINS];
            for (value, (first, weights)) in row.iter_mut().zip(&self.mel_banks) {
                let energy: f64 = weights
                    .iter()
                    .enumerate()
                    .map(|(k, w)| w * power[first + k])
                    .sum();
                *value = energy.max(f32::EPSILON as f64).ln() as f32;
            }
        }

        if frames > 0 {
            for bin in 0..NUM_MEL_BINS {
                let mean = (0..frames).map(|f| features[f * NUM_MEL_BINS + bin]).sum::<f32>() / frames as f32;
                for f in 0..frames {
                    features[f * NUM_MEL_BINS + bin] -= mean;
                }
            }
        }
        features
    }
}

/// Linear-interpolation resampling to 16 kHz (speaker embeddings are robust
/// to the mild aliasing this introduces).
pub fn resample_to_16k(samples: &[f32], sample_rate: u32) -> Vec<f32> {
    if sample_rate as usize == SAMPLE_RATE || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = sample_rate as f64 / SAMPLE_RATE as f64;
    let out_len = (samples.len() as f64 / ratio).floor() as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let idx = pos.floor() as usize;
            let frac = (pos - idx as f64) as f32;
            let a = samples[idx.min(samples.len() - 1)];
            let b = samples[(idx + 1).min(samples.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_count_matches_snip_edges() {
        assert_eq!(Fbank::num_frames(399), 0);
        assert_eq!(Fbank::num_frames(400), 1);
        assert_eq!(Fbank::num_frames(16_000), 98);
    }

    #[test]
    fn features_are_mean_normalised() {
        let samples: Vec<f32> = (0..16_000)
            .map(|i| (i as f32 * 0.05).sin() * 0.3 + ((i * 7919) % 101) as f32 / 1000.0)
            .collect();
        let feats = Fbank::new().compute(&samples);
        assert_eq!(feats.len(), 98 * NUM_MEL_BINS);
        for bin in 0..NUM_MEL_BINS {
            let mean: f32 = (0..98).map(|f| feats[f * NUM_MEL_BINS + bin]).sum::<f32>() / 98.0;
            assert!(mean.abs() < 1e-3, "bin {} mean {}", bin, mean);
        }
    }

    #[test]
    fn resampling_keeps_duration() {
        let x = vec![0.5f32; 48_000];
        assert_eq!(resample_to_16k(&x, 48_000).len(), 16_000);
        assert_eq!(resample_to_16k(&x, 16_000).len(), 48_000);
    }
}
