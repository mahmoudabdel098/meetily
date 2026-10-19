//! Compares the Rust features with a NumPy reference implementation whose
//! output was verified end-to-end with the embedding model.
//!
//! Run with `SPEAKER_ID_FIXTURES=<dir> cargo test -p speaker-id`, where the
//! directory holds `s0_0.wav` (16 kHz mono PCM16) and `ref_fbank_s0_0.f32`
//! (little-endian f32, `[frames][80]`). Skipped when the variable is unset.

use speaker_id::fbank::{Fbank, NUM_MEL_BINS};
use std::path::PathBuf;

fn read_pcm16_wav(path: &PathBuf) -> Vec<f32> {
    let bytes = std::fs::read(path).unwrap();
    let mut pos = 12;
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        if id == b"data" {
            return bytes[pos + 8..pos + 8 + size]
                .chunks_exact(2)
                .map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0)
                .collect();
        }
        pos += 8 + size + (size & 1);
    }
    panic!("no data chunk");
}

#[test]
fn matches_reference_features() {
    let Some(dir) = std::env::var_os("SPEAKER_ID_FIXTURES").map(PathBuf::from) else {
        eprintln!("SPEAKER_ID_FIXTURES not set, skipping");
        return;
    };
    let samples = read_pcm16_wav(&dir.join("s0_0.wav"));
    let reference: Vec<f32> = std::fs::read(dir.join("ref_fbank_s0_0.f32"))
        .unwrap()
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect();

    let features = Fbank::new().compute(&samples);
    assert_eq!(features.len(), reference.len(), "frame count");
    let max_diff = features
        .iter()
        .zip(&reference)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    eprintln!("frames={} max abs diff={}", features.len() / NUM_MEL_BINS, max_diff);
    assert!(max_diff < 1e-3, "max abs diff {}", max_diff);
}
