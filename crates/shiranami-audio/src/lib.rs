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
//! `f32` frames at a [`sink::PcmSink`]; [`peaks::PeakAccumulator`] is the first
//! of them. Nothing here spawns a thread or touches an async runtime: every
//! entry point is a synchronous, CPU-bound function over one file, and the
//! caller decides how many run at once. Architecture §2.1 puts `rayon` in
//! `shiranami-library`'s folder scan, not at this layer — the unit of
//! parallelism for analysis is a track, and this crate never sees more than one.

// Every item here is either renderer-visible contract or a ported guard, and an
// undocumented one is a contract nobody can read.
#![warn(missing_docs)]

pub mod decode;
pub mod error;
pub mod peaks;
pub mod sink;

pub use decode::{DecodeSummary, decode_file};
pub use error::{AudioError, Result};
pub use peaks::{WAVEFORM_PEAK_COUNT, WaveformPeaks, peaks_from_file, reduce_peaks};
pub use sink::{PcmSink, PcmSpec};
