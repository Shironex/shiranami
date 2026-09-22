//! EBU R128 integrated loudness — the replacement for `loudness.fromFile`.
//!
//! The value this produces is persisted per track in `tracks.loudness_lufs` and
//! is the *only* input to volume leveling: the renderer computes
//! `clamp(target - measured, ±12 dB)` and multiplies the deck's gain node by
//! `10^(gain/20)` (`apps/web/src/lib/loudness.ts`, target −14 LUFS). Rows
//! measured by v1 are carried across by first-run continuity and are never
//! re-measured, so v1 and v2 values sit side by side in the same column and
//! must stay comparable — Phase 5's acceptance bar is ±0.1 LU against the
//! addon.
//!
//! That bar is met by construction rather than by re-derivation: the `ebur128`
//! crate is a port of the very `libebur128` v1.2.6 the addon vendored, run in
//! the same `MODE_I` (gated whole-programme loudness per ITU-R BS.1770), fed the
//! same interleaved `f32` frames. Where a measured value can still move is the
//! *decoder* — a lossy codec decoded by symphonia is not sample-identical to
//! one decoded by dr_mp3 — which is why the tests state a per-codec tolerance
//! rather than one number.
//!
//! # What happened to `undecodable`
//!
//! v1 returned three states, and the third was routine: dr_libs read only
//! wav/flac/mp3, so `undecodable` was how an `.m4a` selected the 120-second
//! ffmpeg `loudnorm` subprocess. symphonia's coverage deletes that fallback
//! (architecture §2.9), and with it the reason to model "cannot decode" as a
//! successful outcome — it is an [`AudioError`] now. `Silent` survives, because
//! digital silence is a real measurement of nothing rather than a failure.

use std::path::Path;

use ebur128::{EbuR128, Mode};

use crate::decode::decode_file;
use crate::error::{AudioError, Result};
use crate::sink::{PcmSink, PcmSpec};

/// The outcome of measuring a track's integrated loudness.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum IntegratedLoudness {
    /// A usable measurement, in LUFS. Negative for anything below full scale.
    Measured(f64),
    /// The audio decoded but its loudness is non-finite.
    ///
    /// Digital silence reads as −∞ LUFS. There is nothing to measure and
    /// nothing to level, so the caller stores no value and moves on — the same
    /// decision v1 made, and the reason it did not hand silent tracks to
    /// ffmpeg, which would have returned −∞ just as slowly.
    Silent,
}

impl IntegratedLoudness {
    /// The measured LUFS, or `None` when the track was silent.
    ///
    /// The shape `tracks.loudness_lufs` wants: a nullable real.
    #[must_use]
    pub fn lufs(&self) -> Option<f64> {
        match *self {
            Self::Measured(lufs) => Some(lufs),
            Self::Silent => None,
        }
    }
}

/// Everything one decode measures about a track's loudness (feature wave F5).
///
/// The integrated value is the one the ±0.1 LU parity bar covers; the other
/// two are v2-only additions with no v1 counterpart to stay comparable with.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoudnessProfile {
    /// Gated whole-programme loudness, as [`measure_integrated_loudness`]
    /// reports it.
    pub integrated: IntegratedLoudness,
    /// The loudest true peak across channels, in dBTP — `ebur128`'s 4× polyphase
    /// oversample, so an inter-sample over reads above 0.0. `None` for digital
    /// silence, where there is no peak to speak of.
    pub true_peak_db: Option<f64>,
    /// Loudness range per EBU Tech 3342, in LU. `None` when non-finite.
    pub loudness_range: Option<f64>,
}

/// A [`PcmSink`] that feeds frames to the EBU R128 analyser as they decode.
///
/// Unlike the peak envelope this keeps no audio at all — the analyser's state is
/// a fixed handful of filter histories and gating blocks — so measuring a
/// two-hour file costs the same memory as measuring a two-second one. The addon
/// held the entire decoded track in RAM to do the same job.
#[derive(Debug, Default)]
pub struct LoudnessAnalyzer {
    state: Option<EbuR128>,
    channels: u16,
}

impl LoudnessAnalyzer {
    /// An analyser that has not yet been told the stream format.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Read the gated integrated loudness accumulated so far.
    ///
    /// # Errors
    ///
    /// [`AudioError::Analysis`] if no frames were ever accepted, or if the
    /// analyser rejects the query.
    pub fn finish(&self) -> Result<IntegratedLoudness> {
        let state = self.ready()?;

        match state.loudness_global() {
            // `is_finite` filters the −∞ of digital silence and any NaN,
            // mirroring both the addon's `std::isfinite` guard and the ffmpeg
            // path's rejection of a non-finite `input_i`.
            Ok(lufs) if lufs.is_finite() => Ok(IntegratedLoudness::Measured(lufs)),
            Ok(_) => Ok(IntegratedLoudness::Silent),
            Err(error) => Err(AudioError::Analysis {
                reason: error.to_string(),
            }),
        }
    }

    /// Read the full loudness profile accumulated so far.
    ///
    /// # Errors
    ///
    /// [`AudioError::Analysis`] under the same conditions as [`finish`], which
    /// this extends rather than replaces — `finish` is the parity-pinned v1
    /// surface, this is the F5 surface beside it.
    ///
    /// [`finish`]: LoudnessAnalyzer::finish
    pub fn profile(&self) -> Result<LoudnessProfile> {
        let integrated = self.finish()?;
        let state = self.ready()?;

        // Loudest linear true peak across channels, then into dBTP. Digital
        // silence peaks at exactly 0.0 linear, whose log is −∞ — that is the
        // `None`, matching how `Silent` stores no LUFS.
        let mut peak = 0.0_f64;
        for channel in 0..u32::from(self.channels) {
            let value = state
                .true_peak(channel)
                .map_err(|error| AudioError::Analysis {
                    reason: error.to_string(),
                })?;
            peak = peak.max(value);
        }
        let true_peak_db = Some(20.0 * peak.log10()).filter(|db| db.is_finite());

        let range = state
            .loudness_range()
            .map_err(|error| AudioError::Analysis {
                reason: error.to_string(),
            })?;
        let loudness_range = Some(range).filter(|lra| lra.is_finite());

        Ok(LoudnessProfile {
            integrated,
            true_peak_db,
            loudness_range,
        })
    }

    /// The analyser state, or the "no frames" failure both readers share.
    fn ready(&self) -> Result<&EbuR128> {
        self.state.as_ref().ok_or_else(|| AudioError::Analysis {
            reason: "no frames were analysed".to_owned(),
        })
    }
}

/// Album-level integrated loudness: one BS.1770 gate over the union of every
/// track's blocks, via `EbuR128::loudness_global_multiple` (feature wave F5).
///
/// This is the ReplayGain "album gain" primitive — the quiet interlude stays
/// quiet relative to its record because the gate is computed once across the
/// whole album rather than per track. The caller keeps each track's
/// [`LoudnessAnalyzer`] alive for the duration of the album and hands them all
/// in; an album is small (tens of tracks) and each state is a fixed handful of
/// filter histories, so this stays O(album), never O(library).
///
/// # Errors
///
/// [`AudioError::Analysis`] if the slice is empty, if any analyser never
/// accepted a frame, or if the fold itself is rejected.
pub fn album_integrated_loudness(analyzers: &[LoudnessAnalyzer]) -> Result<IntegratedLoudness> {
    if analyzers.is_empty() {
        return Err(AudioError::Analysis {
            reason: "no tracks were analysed for the album".to_owned(),
        });
    }

    let mut states = Vec::with_capacity(analyzers.len());
    for analyzer in analyzers {
        states.push(analyzer.ready()?);
    }

    match EbuR128::loudness_global_multiple(states.into_iter()) {
        Ok(lufs) if lufs.is_finite() => Ok(IntegratedLoudness::Measured(lufs)),
        Ok(_) => Ok(IntegratedLoudness::Silent),
        Err(error) => Err(AudioError::Analysis {
            reason: error.to_string(),
        }),
    }
}

impl PcmSink for LoudnessAnalyzer {
    fn begin(&mut self, spec: PcmSpec) -> Result<()> {
        // `TRUE_PEAK` and `LRA` ride the same pass (F5). Neither changes what
        // `loudness_global` reports, so the ±0.1 LU parity bar is untouched;
        // true peak costs a 4× oversample, which is small next to the decode.
        let mode = Mode::I | Mode::TRUE_PEAK | Mode::LRA;
        let state =
            EbuR128::new(u32::from(spec.channels), spec.sample_rate, mode).map_err(|error| {
                AudioError::Analysis {
                    reason: format!("{error} ({} ch @ {} Hz)", spec.channels, spec.sample_rate),
                }
            })?;
        self.state = Some(state);
        self.channels = spec.channels;
        Ok(())
    }

    fn accept(&mut self, interleaved: &[f32]) -> Result<()> {
        let state = self.state.as_mut().ok_or_else(|| AudioError::Analysis {
            reason: "frames arrived before the stream format".to_owned(),
        })?;

        state
            .add_frames_f32(interleaved)
            .map_err(|error| AudioError::Analysis {
                reason: error.to_string(),
            })
    }
}

/// Measure the EBU R128 integrated loudness of an audio file, in LUFS.
///
/// # Errors
///
/// Propagates every [`AudioError`] [`decode_file`] can raise, plus
/// [`AudioError::Analysis`] if the stream's channel count or sample rate is
/// outside what EBU R128 can be initialised for.
pub fn measure_integrated_loudness(path: &Path) -> Result<IntegratedLoudness> {
    let mut analyzer = LoudnessAnalyzer::new();
    decode_file(path, &mut analyzer)?;
    analyzer.finish()
}

/// Measure a file's full loudness profile — integrated, true peak and range —
/// in one decode.
///
/// # Errors
///
/// Exactly [`measure_integrated_loudness`]'s. A caller that also needs the
/// analyser afterwards (the album fold) drives [`decode_file`] with a
/// [`LoudnessAnalyzer`] itself instead.
pub fn measure_loudness_profile(path: &Path) -> Result<LoudnessProfile> {
    let mut analyzer = LoudnessAnalyzer::new();
    decode_file(path, &mut analyzer)?;
    analyzer.profile()
}
