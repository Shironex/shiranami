//! Clock and calendar primitives, hand-rolled because no date crate is pinned.
//!
//! Appendix B pins neither `chrono` nor `time`, deliberately: every date need in
//! this port is a port of something the `Date` global did for free in v1, and
//! the compatibility surface is *V8's* behaviour rather than any crate's. Each
//! module here reproduces one direction of that and says which V8 quirks it
//! keeps.
//!
//! `shiranami-library`'s `iso8601` formatter (the `toISOString()` direction)
//! carries the same "move it down on a second consumer" note this module's
//! parser carried until Phase 14; it belongs beside [`instant`] when that
//! happens.

pub mod instant;

pub use instant::{now_ms, parse_iso8601_ms};
