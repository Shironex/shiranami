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

use crate::error::Result;
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
