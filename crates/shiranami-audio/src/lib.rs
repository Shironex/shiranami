//! Offline audio analysis. Playback is not here and never will be.
//!
//! The audio engine stays in the renderer (`useAudioEngine.ts`, Web Audio);
//! this crate is the Rust replacement for the C++ N-API addon. It owns
//! `symphonia` decoding, waveform peak reduction, EBU R128 loudness via the
//! `ebur128` crate — a port of the very library the addon vendored, so results
//! match — and, since the v2 feature wave, tempo and key estimation on
//! `realfft`, ported from the addon branch's own C++ third rung. Symphonia's
//! format coverage is what lets the ffmpeg `loudnorm` fallback be deleted
//! outright. The public API stays FFI-shaped so a `cc`-built C++ core could be
//! swapped back in behind it without touching callers.
//!
//! Ported in Phase 5; LUFS must land within ±0.1 LU of the C++ addon on the
//! fixture set. See `docs/v2/architecture.md` §2.9.
//!
//! # Shape
//!
//! One decoder, several consumers. [`decode::decode_file`] pushes interleaved
//! `f32` frames at a [`sink::PcmSink`]; the analysers are
//! [`peaks::PeakAccumulator`], [`loudness::LoudnessAnalyzer`],
//! [`bpm::TempoAnalyzer`] and [`key::KeyAnalyzer`], and
//! [`analysis::FanOutSink`] is what lets one decode feed any set of them at
//! once — [`analysis::analyze_file`] being the everything-from-one-pass entry
//! point. Nothing here spawns a thread or touches an async runtime: every entry
//! point is a synchronous, CPU-bound function over one file, and the caller
//! decides how many run at once. Architecture §2.1 puts `rayon` in
//! `shiranami-library`'s folder scan, not at this layer — the unit of
//! parallelism for analysis is a track, and this crate never sees more than one.
//!
//! # What compatibility means here
//!
//! Two artefacts outlive the port and constrain it, both per architecture §3:
//!
//! * **the `waveform-peaks/` cache**, copied verbatim into the v2 profile on
//!   first run. [`peaks::cache`] reproduces v1's key construction and document
//!   format exactly, so an existing entry is a hit rather than a silent
//!   re-decode of the user's whole library.
//! * **`tracks.loudness_lufs`**, carried across with the database and never
//!   re-measured. A v1 row and a v2 row must mean the same thing, because
//!   volume leveling subtracts both from the same target.
//!
//! # Rung 3
//!
//! Shipped. The seam held exactly as this section used to promise: [`bpm`] is
//! the onset-detector sink with its `bpm_from_file`, [`key`] its chromagram
//! sibling, both ported faithfully from the unit-tested C++ on the
//! `feat/native-bpm-key-addon` branch (the ladder's stranded third rung),
//! reusing the decoder and the error taxonomy unchanged. Their parity vectors —
//! the C++ suite's own synthesised click tracks and triads — port with them as
//! module tests.

// Every item here is either renderer-visible contract or a ported guard, and an
// undocumented one is a contract nobody can read.
#![warn(missing_docs)]

pub mod analysis;
pub mod bpm;
pub mod decode;
pub mod error;
pub mod key;
pub mod loudness;
pub mod peaks;
pub mod sink;

pub use analysis::{AnalyzeRequest, FanOutSink, TrackAnalysis, analyze_file};
pub use bpm::{TempoAnalyzer, bpm_from_file};
pub use decode::{DecodeSummary, decode_file};
pub use error::{AudioError, Result};
pub use key::{KeyAnalyzer, KeyEstimate, key_from_file};
pub use loudness::{IntegratedLoudness, measure_integrated_loudness};
pub use peaks::{WAVEFORM_PEAK_COUNT, WaveformPeaks, peaks_from_file, reduce_peaks};
pub use sink::{PcmSink, PcmSpec};
