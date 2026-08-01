//! The one-pass PCM contract every analyser in this crate is written against.
//!
//! Decoding a track is by far the expensive half of any analysis — the C++
//! addon paid it twice, once in `waveform.fromFile` and again in
//! `loudness.fromFile`, because each owned its own `decodeAudioFile` call and
//! its own full-file `float*` buffer.
//!
//! Splitting "decode" from "consume" fixes both. [`decode_file`] pushes frames
//! at a [`PcmSink`] as they come off the decoder, so an analyser that does not
//! need the whole track in memory never allocates it, and a caller that wants
//! two measurements from one decode implements a sink that forwards to both.
//!
//! It is also the seam the third rung of the ladder plugs into: BPM detection
//! (`realfft`, post-v2, architecture §2.9) arrives as another `PcmSink`
//! implementation and needs no change to the decoder.
//!
//! [`decode_file`]: crate::decode::decode_file

use crate::error::Result;

/// The format of the PCM stream a [`PcmSink`] is about to receive.
///
/// Fixed for the whole stream: [`decode_file`](crate::decode::decode_file)
/// rejects a file whose channel count or sample rate changes mid-way rather
/// than passing the change on, because neither peak reduction nor EBU R128 has
/// a defined meaning across such a seam.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PcmSpec {
    /// Channels per frame. One frame is one sample per channel, and the
    /// buffers handed to [`PcmSink::accept`] are channel-interleaved.
    pub channels: u16,
    /// Sample rate in Hz.
    pub sample_rate: u32,
}

/// Receives decoded PCM one buffer at a time.
///
/// The contract is: [`begin`](PcmSink::begin) exactly once, before any
/// [`accept`](PcmSink::accept); then `accept` zero or more times with
/// interleaved frames; then whatever the concrete type offers to finish. A sink
/// that returns `Err` from either method aborts the decode.
pub trait PcmSink {
    /// Announce the stream format. Called once, before the first `accept`.
    fn begin(&mut self, spec: PcmSpec) -> Result<()>;

    /// Consume one buffer of channel-interleaved frames.
    ///
    /// `interleaved.len()` is always a whole multiple of
    /// [`PcmSpec::channels`]; a sink may rely on that.
    fn accept(&mut self, interleaved: &[f32]) -> Result<()>;
}
