//! Tempo estimation — the third rung, ported from the addon branch's C++.
//!
//! The algorithm is `core/tempo.cpp` from `feat/native-bpm-key-addon`, line for
//! line: an energy envelope at a fixed 100 Hz, half-wave-rectified flux, an
//! autocorrelation over the 60–180 BPM lag band, parabolic peak interpolation
//! for a fractional lag, and octave folding back into the band. The C++ tests
//! (`test_tempo.cpp`) port with it as the parity vectors in this module.
//!
//! The one structural change is the shape, not the maths: the C++ operated on a
//! whole decoded buffer, while [`TempoAnalyzer`] is a [`PcmSink`] fed frames as
//! they decode. Energy windows accumulate across buffer boundaries in stream
//! order, so the envelope — and therefore the estimate — is identical to the
//! whole-buffer computation, and a two-hour file costs one envelope
//! (`duration × 100` values) rather than its decoded PCM in memory.
//!
//! # "Unknown" is `None`, not `0.0`
//!
//! The C++ returned `0.0` for silence, beatless material and audio too short to
//! autocorrelate, and its service layer mapped that to `null` before
//! persisting. The sentinel does not survive the port: [`TempoAnalyzer::finish`]
//! returns `Option<f64>` and the caller stores `NULL` directly — same policy,
//! one fewer magic number.

use std::path::Path;

use crate::decode::decode_file;
use crate::error::Result;
use crate::sink::{PcmSink, PcmSpec};

/// Lowest tempo reported. Below this the estimate is doubled up into the band.
pub const MIN_BPM: f64 = 60.0;

/// Highest tempo reported (exclusive). At or above it the estimate is halved.
pub const MAX_BPM: f64 = 180.0;

/// The onset envelope's fixed sample rate, in Hz.
///
/// Fixed regardless of the file's sample rate so the lag↔BPM arithmetic is
/// independent of the source format. 100 Hz is ~10 ms resolution — fine for
/// tempo, and small enough that autocorrelating a whole song stays cheap.
const ENVELOPE_RATE_HZ: f64 = 100.0;

/// A [`PcmSink`] that accumulates the energy envelope tempo is estimated from.
///
/// Feed it a stream (or let [`bpm_from_file`] decode one into it), then call
/// [`finish`](TempoAnalyzer::finish).
#[derive(Debug, Default)]
pub struct TempoAnalyzer {
    /// Input frames per envelope value — `sample_rate / 100`, truncated as the
    /// C++ truncated. Zero means the stream format was degenerate and the
    /// estimate is unknown.
    hop: usize,
    channels: usize,
    /// Mean-square energies, one per completed window.
    energies: Vec<f64>,
    /// Running sum of squares in the current, incomplete window.
    window_sum_sq: f64,
    /// Frames accumulated into the current window so far.
    window_frames: usize,
}

impl TempoAnalyzer {
    /// An analyser that has not yet been told the stream format.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The tempo estimate, or `None` when there is none to report — silence, no
    /// discernible beat, or audio too short to autocorrelate over the search
    /// window. The C++ returned `0.0` for every one of these.
    #[must_use]
    pub fn finish(&self) -> Option<f64> {
        if self.hop == 0 {
            return None;
        }

        let onset = onset_envelope(&self.energies);

        // Lag bounds: BPM = 60 · rate / lag. `round` matches `std::lround` for
        // the positive constants these are.
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "60·100/180 and 60·100/60 are small positive constants"
        )]
        let min_lag = (60.0 * ENVELOPE_RATE_HZ / MAX_BPM).round() as usize;
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "small positive constant"
        )]
        let max_lag = (60.0 * ENVELOPE_RATE_HZ / MIN_BPM).round() as usize;
        if min_lag < 1 || onset.len() < max_lag * 2 {
            return None;
        }

        // Autocorrelation over the band; keep the strongest lag.
        let mut corr = vec![0.0_f64; max_lag + 1];
        let mut best_value = 0.0_f64;
        let mut best_lag = 0_usize;
        for lag in min_lag..=max_lag {
            let mut sum = 0.0_f64;
            let mut i = 0;
            while i + lag < onset.len() {
                sum += onset[i] * onset[i + lag];
                i += 1;
            }
            corr[lag] = sum;
            if sum > best_value {
                best_value = sum;
                best_lag = lag;
            }
        }
        if best_lag == 0 || best_value <= 0.0 {
            return None;
        }

        // Refine the integer lag to a fractional one, then convert and fold.
        #[expect(clippy::cast_precision_loss, reason = "lags are at most 100")]
        let refined_lag = best_lag as f64 + parabolic_peak_offset(&corr, best_lag);
        if refined_lag <= 0.0 {
            return None;
        }
        Some(fold_into_range(60.0 * ENVELOPE_RATE_HZ / refined_lag))
    }
}

impl PcmSink for TempoAnalyzer {
    fn begin(&mut self, spec: PcmSpec) -> Result<()> {
        // The C++ truncated: `static_cast<size_t>(sampleRate / 100.0)`.
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "sample rates divided by 100 fit comfortably"
        )]
        {
            self.hop = (f64::from(spec.sample_rate) / ENVELOPE_RATE_HZ) as usize;
        }
        self.channels = usize::from(spec.channels);
        Ok(())
    }

    fn accept(&mut self, interleaved: &[f32]) -> Result<()> {
        if self.hop == 0 || self.channels == 0 {
            return Ok(());
        }

        // Energy = mean square of every sample (all channels) in the window.
        // Samples are summed in stream order, which is exactly the
        // frame-then-channel order the C++ summed a window in, so a window that
        // spans a buffer boundary accumulates the same f64 as one that does not.
        for frame in interleaved.chunks_exact(self.channels) {
            for sample in frame {
                self.window_sum_sq += f64::from(*sample) * f64::from(*sample);
            }
            self.window_frames += 1;
            if self.window_frames == self.hop {
                #[expect(
                    clippy::cast_precision_loss,
                    reason = "hop × channels is a few thousand at most"
                )]
                self.energies
                    .push(self.window_sum_sq / (self.hop * self.channels) as f64);
                self.window_sum_sq = 0.0;
                self.window_frames = 0;
            }
        }
        // A trailing partial window stays pending and, if never filled, is
        // dropped — the C++ loop condition `start + hop <= totalFrames` dropped
        // the same tail.
        Ok(())
    }
}

/// Onset strength: the positive first difference of the energy envelope.
///
/// Rising energy (an attack) spikes; decay clamps to zero so sustained notes do
/// not register as beats.
fn onset_envelope(energies: &[f64]) -> Vec<f64> {
    if energies.len() < 2 {
        return Vec::new();
    }
    let mut onset = vec![0.0_f64; energies.len()];
    for i in 1..energies.len() {
        let diff = energies[i] - energies[i - 1];
        onset[i] = if diff > 0.0 { diff } else { 0.0 };
    }
    onset
}

/// Parabolic interpolation around a discrete peak at index `i` of `r`.
///
/// Fits a parabola through `(i-1, i, i+1)` and returns the sub-sample offset of
/// its vertex in `[-0.5, 0.5]`, giving a fractional lag and hence a fractional
/// BPM.
fn parabolic_peak_offset(r: &[f64], i: usize) -> f64 {
    if i == 0 || i + 1 >= r.len() {
        return 0.0;
    }
    let a = r[i - 1];
    let b = r[i];
    let c = r[i + 1];
    let denom = a - 2.0 * b + c;
    if denom == 0.0 {
        return 0.0;
    }
    0.5 * (a - c) / denom
}

/// Fold a tempo into `[MIN_BPM, MAX_BPM)` by doubling and halving.
///
/// Autocorrelation commonly locks onto half or double the true tempo; folding
/// canonicalises the estimate.
fn fold_into_range(mut bpm: f64) -> f64 {
    if bpm <= 0.0 {
        return 0.0;
    }
    while bpm < MIN_BPM {
        bpm *= 2.0;
    }
    while bpm >= MAX_BPM {
        bpm /= 2.0;
    }
    bpm
}

/// Decode `path` once and estimate its tempo.
///
/// `Ok(None)` is a successful analysis with nothing to report — the caller
/// persists `NULL`, exactly as the addon's service mapped `bpm: 0`.
///
/// # Errors
///
/// Propagates every [`AudioError`](crate::error::AudioError) that
/// [`decode_file`] can raise.
pub fn bpm_from_file(path: &Path) -> Result<Option<f64>> {
    let mut analyzer = TempoAnalyzer::new();
    decode_file(path, &mut analyzer)?;
    Ok(analyzer.finish())
}

#[cfg(test)]
mod tests {
    //! The C++ suite (`test_tempo.cpp`), ported vector for vector, plus the
    //! streaming property the sink shape introduces.

    use super::*;

    const SAMPLE_RATE: u32 = 44_100;

    /// `synth_audio.hpp`'s `makeClickTrack`: a ~50 ms burst of 0.8 at each
    /// beat, silence between, mono.
    fn click_track(bpm: f64, seconds: f64) -> Vec<f32> {
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "test sizes"
        )]
        let total = (seconds * f64::from(SAMPLE_RATE)) as usize;
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "test sizes"
        )]
        let period = (60.0 / bpm * f64::from(SAMPLE_RATE)) as usize;
        let burst = SAMPLE_RATE as usize / 20;

        let mut samples = vec![0.0_f32; total];
        let mut beat = 0;
        while beat < total {
            for i in 0..burst.min(total - beat) {
                samples[beat + i] = 0.8;
            }
            beat += period;
        }
        samples
    }

    /// Feed a mono buffer through the sink in `chunk`-sized buffers.
    fn estimate(samples: &[f32], chunk: usize) -> Option<f64> {
        let mut analyzer = TempoAnalyzer::new();
        analyzer
            .begin(PcmSpec {
                channels: 1,
                sample_rate: SAMPLE_RATE,
            })
            .expect("begin");
        for buffer in samples.chunks(chunk) {
            analyzer.accept(buffer).expect("accept");
        }
        analyzer.finish()
    }

    #[track_caller]
    fn assert_within_five_percent(actual: Option<f64>, expected: f64) {
        let bpm = actual.expect("a click track has a tempo");
        assert!(
            (bpm - expected).abs() <= expected * 0.05,
            "estimated {bpm} BPM, expected ≈{expected}"
        );
    }

    #[test]
    fn recovers_a_120_bpm_click_track() {
        assert_within_five_percent(estimate(&click_track(120.0, 8.0), 4096), 120.0);
    }

    #[test]
    fn recovers_a_90_bpm_click_track() {
        assert_within_five_percent(estimate(&click_track(90.0, 8.0), 4096), 90.0);
    }

    #[test]
    fn folds_a_fast_click_into_the_band() {
        // 200 BPM is above the band; the estimator folds it to 100.
        let bpm = estimate(&click_track(200.0, 8.0), 4096).expect("a click track has a tempo");
        assert!((MIN_BPM..MAX_BPM).contains(&bpm), "got {bpm}");
    }

    #[test]
    fn silence_has_no_detectable_tempo() {
        assert_eq!(estimate(&vec![0.0; SAMPLE_RATE as usize * 4], 4096), None);
    }

    #[test]
    fn audio_shorter_than_the_search_window_reports_none() {
        assert_eq!(estimate(&[0.5; 1_000], 4096), None);
    }

    #[test]
    fn the_estimate_is_independent_of_buffer_chunking() {
        // The streaming property: windows accumulate across buffer boundaries
        // in stream order, so any chunking produces the identical envelope.
        let samples = click_track(120.0, 8.0);
        let whole = estimate(&samples, samples.len());
        let odd = estimate(&samples, 1_237);
        let tiny = estimate(&samples, 64);
        assert_eq!(whole, odd);
        assert_eq!(whole, tiny);
    }

    #[test]
    fn stereo_and_mono_agree_on_a_duplicated_signal() {
        // Energy is the mean square over every channel, so a channel-duplicated
        // stream has the same envelope as its mono source.
        let mono = click_track(120.0, 8.0);
        let stereo: Vec<f32> = mono.iter().flat_map(|s| [*s, *s]).collect();

        let mut analyzer = TempoAnalyzer::new();
        analyzer
            .begin(PcmSpec {
                channels: 2,
                sample_rate: SAMPLE_RATE,
            })
            .expect("begin");
        analyzer.accept(&stereo).expect("accept");

        assert_eq!(analyzer.finish(), estimate(&mono, mono.len()));
    }
}
