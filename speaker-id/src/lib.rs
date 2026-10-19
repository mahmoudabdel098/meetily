//! Building blocks for "who said what" in meeting transcripts.
//!
//! - [`attribution`]: decides whether a speech segment came from the local
//!   microphone (you) or from the call audio (other participants), from the
//!   energy of the two capture streams;
//! - [`fbank`]: Kaldi-compatible features for speaker-embedding models;
//! - [`cluster`]: groups remote segments into distinct participants.
//!
//! The ONNX embedding model itself runs in the app, which owns the runtime.

pub mod attribution;
pub mod cluster;
pub mod fbank;

pub use attribution::{EnergyTimeline, Source};
pub use cluster::{ClusterConfig, OnlineClusterer};
pub use fbank::{resample_to_16k, Fbank};
