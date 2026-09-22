//! Clock and calendar primitives, hand-rolled because no date crate is pinned.
//!
//! Appendix B pins neither `chrono` nor `time`, deliberately: every date need in
//! this port is a port of something the `Date` global did for free in v1, and
//! the compatibility surface is *V8's* behaviour rather than any crate's. Each
//! module here reproduces one direction of that and says which V8 quirks it
//! keeps.
//!
//! Both directions now live here. [`instant`] parses (`Date.parse`, `Date.now`)
//! and arrived from `shiranami-recommendation` in the Phase 14 kickoff;
//! [`iso8601`] formats (`toISOString`) and arrived from `shiranami-library`
//! when the `recommendations:*` lane became its second consumer. Each keeps a
//! re-export at its old path, because the paths are the ones a reader of those
//! crates follows and a helper changing rank is not a reason to move them.

pub mod instant;
pub mod iso8601;

pub use instant::{now_ms, parse_iso8601_ms};
