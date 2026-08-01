//! `new Date().toISOString()` — re-exported from [`shiranami_core::time`].
//!
//! The implementation lived here through Phase 10, when [`crate::storage`]'s
//! `computedAt` was its only consumer, under a note saying to move it down as
//! soon as a second one appeared. Phase 14's `recommendations:*` lane is that
//! consumer — a cached shelf's `generatedAt` is the same string — and
//! `shiranami-recommendation` sits beside this crate on the spine rather than
//! below it, so the shared calendar had to move to `shiranami-core`.
//!
//! This module survives as a re-export rather than being deleted for the same
//! reason the recommendation crate's `core::instant` did when the parse
//! direction made the same trip: `crate::storage` documents its timestamp by
//! pointing here, and that path is the one a reader of this crate follows.
pub use shiranami_core::time::iso8601::{from_epoch_millis, now};
