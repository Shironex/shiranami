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
