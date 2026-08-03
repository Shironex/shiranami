//! One decode, every analyser — the fan-out over the [`PcmSink`] seam.
//!
//! [`crate::sink`]'s docs promised this from the start: *"a caller that wants
//! two measurements from one decode implements a sink that forwards to both."*
//! Until now every caller paid a full decode per measurement —
//! [`crate::peaks::peaks_from_file`] and
//! [`crate::loudness::measure_integrated_loudness`] each open their own
//! [`decode_file`](crate::decode::decode_file) — which was the correct port
//! fidelity and is now the largest unclaimed win: decoding is by far the
//! expensive half of any analysis, and the addon this crate replaced paid it
//! twice.
//!
//! [`FanOutSink`] is the promised sink. It owns nothing and measures nothing
//! itself; it forwards `begin` and `accept` to every analyser it was given, in
//! order, so each one observes **exactly the stream it would have observed
//! alone** — same spec, same buffers, same boundaries. That is what makes the
//! one-pass results interchangeable with the separate-path ones: peaks come out
//! bit-identical and LUFS comes out equal, which `tests/analysis_one_pass.rs`
//! asserts rather than assumes.
//!
//! # Failure semantics
//!
//! The first sink to return an error aborts the decode, exactly as it would
//! have alone. Sinks earlier in the list have already seen the buffer by then;
//! their state is simply discarded with the run. There is no partial-result
//! contract, because none of the analysers this crate ships can produce one
//! mid-stream.

use std::path::Path;

use crate::bpm::TempoAnalyzer;
use crate::decode::{DecodeSummary, decode_file};
use crate::error::{AudioError, Result};
use crate::key::{KeyAnalyzer, KeyEstimate};
use crate::loudness::{IntegratedLoudness, LoudnessAnalyzer};
use crate::peaks::{PeakAccumulator, WaveformPeaks};
use crate::sink::{PcmSink, PcmSpec};

/// Forwards one PCM stream to several analysers.
///
/// Borrows its sinks rather than boxing them, so the caller keeps ownership and
/// can call each analyser's own `finish`-shaped method afterwards — the trait
/// deliberately has no `finish`, because every analyser's result has a
/// different shape.
pub struct FanOutSink<'a> {
    sinks: Vec<&'a mut dyn PcmSink>,
}

impl<'a> FanOutSink<'a> {
    /// A fan-out over the given analysers. The order is the forwarding order.
    #[must_use]
    pub fn new(sinks: Vec<&'a mut dyn PcmSink>) -> Self {
        Self { sinks }
    }
}

impl std::fmt::Debug for FanOutSink<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FanOutSink")
            .field("sinks", &self.sinks.len())
            .finish()
    }
}

impl PcmSink for FanOutSink<'_> {
    fn begin(&mut self, spec: PcmSpec) -> Result<()> {
        for sink in &mut self.sinks {
            sink.begin(spec)?;
        }
        Ok(())
    }

    fn accept(&mut self, interleaved: &[f32]) -> Result<()> {
        for sink in &mut self.sinks {
            sink.accept(interleaved)?;
        }
        Ok(())
    }
}

/// Which measurements one [`analyze_file`] pass should produce.
///
/// Callers ask only for what they are missing — a track whose peaks are cached
/// and whose loudness is persisted still wants tempo and key, and the whole
/// point of the one-pass engine is that the decode is paid once for whatever
/// subset remains.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnalyzeRequest {
    /// Reduce the waveform to this many peak buckets. `None` skips peaks.
    pub peak_buckets: Option<usize>,
    /// Measure EBU R128 integrated loudness.
    pub loudness: bool,
    /// Estimate tempo.
    pub tempo: bool,
    /// Estimate musical key.
    pub key: bool,
}

impl AnalyzeRequest {
    /// Measure everything, with the given waveform resolution.
    #[must_use]
    pub fn everything(peak_buckets: usize) -> Self {
        Self {
            peak_buckets: Some(peak_buckets),
            loudness: true,
            tempo: true,
            key: true,
        }
    }

    /// Whether this request measures nothing at all.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.peak_buckets.is_none() && !self.loudness && !self.tempo && !self.key
    }
}

/// Every measurement one decode produced.
///
/// A field is `None` when the request skipped it; `bpm` and `key` are *also*
/// `None` when they were measured and nothing was detectable, because both
/// analysers already express "unknown" that way and the caller persists `NULL`
/// either way.
#[derive(Debug, Clone, PartialEq)]
pub struct TrackAnalysis {
    /// What the decode itself measured about the stream.
    pub summary: DecodeSummary,
    /// The waveform, when requested.
    pub peaks: Option<WaveformPeaks>,
    /// Integrated loudness, when requested.
    pub loudness: Option<IntegratedLoudness>,
    /// Estimated tempo, when requested and detectable.
    pub bpm: Option<f64>,
    /// Estimated key, when requested and detectable.
    pub key: Option<KeyEstimate>,
}

/// Decode `path` exactly once and produce every requested measurement.
///
/// The numbers are interchangeable with the separate entry points' —
/// [`peaks_from_file`](crate::peaks::peaks_from_file) bit for bit,
/// [`measure_integrated_loudness`](crate::loudness::measure_integrated_loudness)
/// exactly, [`bpm_from_file`](crate::bpm::bpm_from_file) and
/// [`key_from_file`](crate::key::key_from_file) exactly — which
/// `tests/analysis_one_pass.rs` asserts. What changes is the cost: one decode
/// instead of one per measurement.
///
/// # Errors
///
/// [`AudioError::BadRequest`] when the request measures nothing or asks for
/// zero peak buckets (the same guard `peaks_from_file` applies); otherwise
/// whatever [`decode_file`] or an analyser raises.
pub fn analyze_file(path: &Path, request: AnalyzeRequest) -> Result<TrackAnalysis> {
    if request.is_empty() {
        return Err(AudioError::BadRequest(
            "the analysis request measures nothing".to_owned(),
        ));
    }
    if request.peak_buckets == Some(0) {
        return Err(AudioError::BadRequest(
            "buckets must be greater than zero".to_owned(),
        ));
    }

    let mut peaks = request.peak_buckets.map(|_| PeakAccumulator::new());
    let mut loudness = request.loudness.then(LoudnessAnalyzer::new);
    let mut tempo = request.tempo.then(TempoAnalyzer::new);
    let mut key = request.key.then(KeyAnalyzer::new);

    let mut sinks: Vec<&mut dyn PcmSink> = Vec::with_capacity(4);
    if let Some(sink) = peaks.as_mut() {
        sinks.push(sink);
    }
    if let Some(sink) = loudness.as_mut() {
        sinks.push(sink);
    }
    if let Some(sink) = tempo.as_mut() {
        sinks.push(sink);
    }
    if let Some(sink) = key.as_mut() {
        sinks.push(sink);
    }

    let mut fan_out = FanOutSink::new(sinks);
    let summary = decode_file(path, &mut fan_out)?;

    Ok(TrackAnalysis {
        summary,
        peaks: match (peaks, request.peak_buckets) {
            (Some(accumulator), Some(buckets)) => Some(WaveformPeaks {
                peaks: accumulator.envelope().reduce(buckets),
                sample_rate: summary.spec.sample_rate,
                channels: summary.spec.channels,
                duration_secs: summary.duration_secs(),
            }),
            _ => None,
        },
        loudness: loudness.map(|analyzer| analyzer.finish()).transpose()?,
        bpm: tempo.and_then(|analyzer| analyzer.finish()),
        key: key.and_then(|analyzer| analyzer.finish()),
    })
}
