//! `Date.parse` / `Date.now` — re-exported from [`shiranami_core::time`].
//!
//! The implementation lived here through Phase 4, when the scoring core was its
//! only consumer. Phase 4's amendment said to move it down as soon as a second
//! one appeared; Phase 12 produced several, so Phase 14 moved it to
//! `shiranami-core` along with its tests.
//!
//! This module survives as a re-export rather than being deleted because
//! `affinity` documents `TrackStats::last_played_at` and `AffinityOptions::now_ms`
//! by pointing at `crate::core::instant`, and those paths are the ones a reader
//! of the scoring core follows. The scoring core's public surface is a port
//! contract; it does not change because a helper moved rank.
pub use shiranami_core::time::instant::{now_ms, parse_iso8601_ms};
