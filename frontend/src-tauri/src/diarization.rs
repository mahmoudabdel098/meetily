//! Speaker labels for live transcripts ("who said what").
//!
//! The audio pipeline mixes microphone and call audio before speech
//! detection. A [`Diarizer`] sees both streams per mixing window and, for each
//! detected speech segment:
//! - labels it "Tu" when the microphone dominates;
//! - otherwise extracts the call audio, computes a voice embedding with the
//!   3D-Speaker CAM++ model (`models/speaker/campplus.onnx`, run locally with
//!   ONNX Runtime) and clusters it into "Partecipante 1", "Partecipante 2"...
//!
//! Without the model, remote speech is labelled "Altri partecipanti".
//! Labels are keyed by audio chunk id and read by the transcription worker
//! when it emits the transcript update for that chunk.

use log::{info, warn};
use ndarray::Array3;
use ort::session::Session;
use ort::value::TensorRef;
use speaker_id::fbank::{Fbank, NUM_MEL_BINS};
use speaker_id::{resample_to_16k, ClusterConfig, EnergyTimeline, OnlineClusterer, Source};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Runtime};

use crate::portable::PortablePathExt;

pub const LOCAL_LABEL: &str = "Tu";
pub const REMOTE_FALLBACK_LABEL: &str = "Altri partecipanti";
pub const MODEL_FILE: &str = "campplus.onnx";

/// Call audio kept for analysis (segments are labelled right after detection)
const TIMELINE_RETENTION_MS: f64 = 60_000.0;
/// Shorter remote segments reuse the previous remote speaker
const MIN_EMBEDDING_SECS: f32 = 0.6;

static MODELS_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
static LABELS: Mutex<Option<HashMap<u64, String>>> = Mutex::new(None);

/// Records where the speaker model lives (`<app data>/models/speaker`).
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    match app.path().portable_app_data_dir() {
        Ok(dir) => {
            let models_dir = dir.join("models").join("speaker");
            info!("Speaker model directory: {}", models_dir.display());
            *MODELS_DIR.lock().unwrap() = Some(models_dir);
        }
        Err(e) => warn!("Speaker identification disabled, no app data dir: {}", e),
    }
}

pub fn participant_label(index: usize) -> String {
    format!("Partecipante {}", index + 1)
}

fn set_label(chunk_id: u64, label: String) {
    LABELS.lock().unwrap().get_or_insert_with(HashMap::new).insert(chunk_id, label);
}

/// Speaker label of an audio chunk sent for transcription, if any.
pub fn label_for_chunk(chunk_id: u64) -> Option<String> {
    LABELS.lock().unwrap().as_ref()?.get(&chunk_id).cloned()
}

fn reset_labels() {
    *LABELS.lock().unwrap() = Some(HashMap::new());
}

struct Embedder {
    session: Session,
    fbank: Fbank,
}

impl Embedder {
    fn load() -> Option<Self> {
        let path = MODELS_DIR.lock().unwrap().as_ref()?.join(MODEL_FILE);
        if !path.is_file() {
            info!("Speaker model not found at {}: remote speakers will not be separated", path.display());
            return None;
        }
        let session = Session::builder()
            .and_then(|b| b.with_intra_threads(1))
            .and_then(|b| b.commit_from_file(&path));
        match session {
            Ok(session) => {
                info!("Loaded speaker model {}", path.display());
                Some(Self { session, fbank: Fbank::new() })
            }
            Err(e) => {
                warn!("Failed to load speaker model {}: {}", path.display(), e);
                None
            }
        }
    }

    /// L2-normalised voice embedding of 16 kHz audio
    fn embed(&mut self, samples_16k: &[f32]) -> Option<Vec<f32>> {
        let features = self.fbank.compute(samples_16k);
        let frames = features.len() / NUM_MEL_BINS;
        if frames == 0 {
            return None;
        }
        let input = Array3::from_shape_vec((1, frames, NUM_MEL_BINS), features).ok()?;
        let result = (|| -> Result<Vec<f32>, ort::Error> {
            let outputs = self
                .session
                .run(ort::inputs!["x" => TensorRef::from_array_view(input.view())?])?;
            let embedding = outputs["embedding"].try_extract_array::<f32>()?;
            Ok(embedding.iter().copied().collect())
        })();
        match result {
            Ok(mut embedding) => {
                speaker_id::cluster::normalize(&mut embedding);
                Some(embedding)
            }
            Err(e) => {
                warn!("Speaker embedding failed: {}", e);
                None
            }
        }
    }
}

/// Per-recording speaker labelling state, owned by the audio pipeline.
pub struct Diarizer {
    timeline: EnergyTimeline,
    clusterer: OnlineClusterer,
    embedder: Option<Embedder>,
    last_remote: Option<usize>,
}

impl Diarizer {
    /// `sample_rate` of the mixing windows passed to [`Diarizer::push_window`].
    pub fn new(sample_rate: u32) -> Self {
        reset_labels();
        Self {
            timeline: EnergyTimeline::new(sample_rate, TIMELINE_RETENTION_MS),
            clusterer: OnlineClusterer::new(ClusterConfig::default()),
            embedder: Embedder::load(),
            last_remote: None,
        }
    }

    /// Feeds one mixing window (same order and length as the audio sent to VAD).
    pub fn push_window(&mut self, mic: &[f32], system: &[f32]) {
        self.timeline.push(mic, system);
    }

    /// Labels the speech segment that will be transcribed as `chunk_id`.
    /// Timestamps are on the VAD timeline (ms since the pipeline started).
    pub fn label_segment(&mut self, chunk_id: u64, start_ms: f64, end_ms: f64) {
        let label = match self.timeline.attribute(start_ms, end_ms) {
            Source::Local => LOCAL_LABEL.to_string(),
            Source::Remote => self.remote_label(start_ms, end_ms),
        };
        set_label(chunk_id, label);
    }

    fn remote_label(&mut self, start_ms: f64, end_ms: f64) -> String {
        let duration_secs = ((end_ms - start_ms) / 1000.0) as f32;
        let fallback = |last: Option<usize>| {
            last.map(participant_label)
                .unwrap_or_else(|| REMOTE_FALLBACK_LABEL.to_string())
        };

        let Some(embedder) = self.embedder.as_mut() else {
            return REMOTE_FALLBACK_LABEL.to_string();
        };
        if duration_secs < MIN_EMBEDDING_SECS {
            return fallback(self.last_remote);
        }

        let audio = self.timeline.system_audio(start_ms, end_ms);
        let audio_16k = resample_to_16k(&audio, self.timeline.sample_rate());
        match embedder.embed(&audio_16k) {
            Some(embedding) => {
                let index = self.clusterer.assign(&embedding, duration_secs);
                self.last_remote = Some(index);
                participant_label(index)
            }
            None => fallback(self.last_remote),
        }
    }
}
