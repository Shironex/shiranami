//! File-level waveform analysis — the replacement for `waveform.fromFile`.

use std::path::Path;

use crate::decode::decode_file;
use crate::error::{AudioError, Result};
use crate::peaks::reduce::FrameEnvelope;
use crate::sink::{PcmSink, PcmSpec};

/// Buckets a waveform is reduced to for the seekbar.
///
/// Frozen at v1's `WAVEFORM_PEAK_COUNT` (`packages/contracts/src/ipc/waveform.ts`):
/// the count is fixed rather than derived from the render width precisely so
/// that the disk cache stays resolution-stable, and every file already sitting
/// in the user's `waveform-peaks/` directory holds exactly this many values.
pub const WAVEFORM_PEAK_COUNT: usize = 512;

/// A decoded track reduced to a drawable waveform.
///
/// Field-for-field the object `waveform.fromFile` returned. Only `peaks` was
/// ever read by v1's TypeScript, but the other three are what make the result
/// interpretable on its own, so they stay.
#[derive(Debug, Clone, PartialEq)]
pub struct WaveformPeaks {
    /// Peak amplitude per bucket. Unnormalised; may exceed 1.0.
    pub peaks: Vec<f32>,
    /// Sample rate of the decoded stream, in Hz.
    pub sample_rate: u32,
    /// Channels in the decoded stream.
    pub channels: u16,
    /// Track length in seconds, from the frames actually decoded.
    pub duration_secs: f64,
}

/// A [`PcmSink`] that accumulates the per-frame envelope a waveform needs.
#[derive(Debug, Default)]
pub struct PeakAccumulator {
    envelope: FrameEnvelope,
    spec: Option<PcmSpec>,
}

impl PeakAccumulator {
    /// An accumulator with no frames yet.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The envelope built so far.
    #[must_use]
    pub fn envelope(&self) -> &FrameEnvelope {
        &self.envelope
    }
}

impl PcmSink for PeakAccumulator {
    fn begin(&mut self, spec: PcmSpec) -> Result<()> {
        self.spec = Some(spec);
        Ok(())
    }

    fn accept(&mut self, interleaved: &[f32]) -> Result<()> {
        let channels = self.spec.map_or(0, |spec| spec.channels);
        self.envelope.push_interleaved(interleaved, channels);
        Ok(())
    }
}

/// Decode `path` and reduce it to `buckets` waveform peaks.
///
/// # Errors
///
/// Propagates every [`AudioError`] [`decode_file`] can raise, plus
/// [`AudioError::BadRequest`] when `buckets` is zero — the addon threw a
/// `RangeError` for the same input.
pub fn peaks_from_file(path: &Path, buckets: usize) -> Result<WaveformPeaks> {
    if buckets == 0 {
        return Err(AudioError::BadRequest("buckets must be greater than zero".to_owned()));
    }

    let mut accumulator = PeakAccumulator::new();
    let summary = decode_file(path, &mut accumulator)?;

    Ok(WaveformPeaks {
        peaks: accumulator.envelope().reduce(buckets),
        sample_rate: summary.spec.sample_rate,
        channels: summary.spec.channels,
        duration_secs: summary.duration_secs(),
    })
}
