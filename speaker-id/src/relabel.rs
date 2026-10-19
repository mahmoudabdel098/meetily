//! Carrying speaker labels over to a new transcription of the same audio.
//!
//! Re-transcribing a recording (e.g. with a more accurate model) produces new
//! segments with different boundaries. Each new segment takes the label of the
//! old segment it overlaps most; without any overlap, the closest old segment
//! within `MAX_GAP_SECS` is used.

const MAX_GAP_SECS: f64 = 2.0;

#[derive(Debug, Clone)]
pub struct LabelledSpan {
    pub start: f64,
    pub end: f64,
    pub speaker: String,
}

/// Speaker for a new segment `[start, end]` (seconds), from the old labelled segments.
pub fn speaker_for_span(old: &[LabelledSpan], start: f64, end: f64) -> Option<String> {
    let (start, end) = if end >= start { (start, end) } else { (end, start) };

    let best_overlap = old
        .iter()
        .map(|span| (span, end.min(span.end) - start.max(span.start)))
        .filter(|(_, overlap)| *overlap > 0.0)
        .max_by(|a, b| a.1.total_cmp(&b.1));
    if let Some((span, _)) = best_overlap {
        return Some(span.speaker.clone());
    }

    old.iter()
        .map(|span| {
            let gap = if span.end < start { start - span.end } else { span.start - end };
            (span, gap)
        })
        .filter(|(_, gap)| *gap <= MAX_GAP_SECS)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(span, _)| span.speaker.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(start: f64, end: f64, speaker: &str) -> LabelledSpan {
        LabelledSpan { start, end, speaker: speaker.to_string() }
    }

    #[test]
    fn picks_largest_overlap() {
        let old = vec![span(0.0, 4.0, "Tu"), span(4.0, 10.0, "Partecipante 1")];
        assert_eq!(speaker_for_span(&old, 1.0, 3.0).as_deref(), Some("Tu"));
        assert_eq!(speaker_for_span(&old, 3.0, 9.0).as_deref(), Some("Partecipante 1"));
    }

    #[test]
    fn falls_back_to_nearest_within_gap() {
        let old = vec![span(0.0, 2.0, "Tu"), span(20.0, 25.0, "Partecipante 2")];
        assert_eq!(speaker_for_span(&old, 3.0, 5.0).as_deref(), Some("Tu"));
        assert_eq!(speaker_for_span(&old, 10.0, 12.0), None);
        assert_eq!(speaker_for_span(&[], 0.0, 1.0), None);
    }
}
