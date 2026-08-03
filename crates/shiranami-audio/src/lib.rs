//! Offline audio analysis. Playback is not here and never will be.
//!
//! The audio engine stays in the renderer (`useAudioEngine.ts`, Web Audio);
//! this crate is the Rust replacement for the C++ N-API addon. It owns
//! `symphonia` decoding, waveform peak reduction, and EBU R128 loudness via
//! the `ebur128` crate — a port of the very library the addon vendored, so
//! results match — with BPM detection (`realfft`) reserved as the third rung
//! post-v2. Symphonia's format coverage is what lets the ffmpeg `loudnorm`
//! fallback be deleted outright. The public API stays FFI-shaped so a
//! `cc`-built C++ core could be swapped back in behind it without touching
//! callers.
//!
//! Ported in Phase 5; LUFS must land within ±0.1 LU of the C++ addon on the
//! fixture set. See `docs/v2/architecture.md` §2.9.
//!
//! # Shape
//!
//! One decoder, several consumers. [`decode::decode_file`] pushes interleaved
//! `f32` frames at a [`sink::PcmSink`]; [`peaks::PeakAccumulator`] and
//! [`loudness::LoudnessAnalyzer`] are the two that exist today, and BPM is the
//! third that will be. Nothing here spawns a thread or touches an async
//! runtime: every entry point is a synchronous, CPU-bound function over one
//! file, and the caller decides how many run at once. Architecture §2.1 puts
//! `rayon` in
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
//! BPM is deliberately absent rather than stubbed. The seam it lands on is
//! [`sink::PcmSink`]: a `bpm` module adds an onset-detector sink and a
//! `bpm_from_file`, reusing the decoder and the error taxonomy unchanged. No
//! placeholder type is exported for it, because an exported placeholder is a
//! contract, and this one has no agreed shape yet.

// Every item here is either renderer-visible contract or a ported guard, and an
// undocumented one is a contract nobody can read.
#![warn(missing_docs)]

pub mod analysis;
pub mod bpm;
pub mod decode;
pub mod error;
pub mod loudness;
pub mod peaks;
pub mod sink;

pub use analysis::FanOutSink;
pub use bpm::{TempoAnalyzer, bpm_from_file};
pub use decode::{DecodeSummary, decode_file};
pub use error::{AudioError, Result};
pub use loudness::{IntegratedLoudness, measure_integrated_loudness};
pub use peaks::{WAVEFORM_PEAK_COUNT, WaveformPeaks, peaks_from_file, reduce_peaks};
pub use sink::{PcmSink, PcmSpec};
