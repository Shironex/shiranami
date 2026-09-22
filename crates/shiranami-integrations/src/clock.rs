//! The crate's shared wall clock.
//!
//! Both lane-B modules need "now" in milliseconds and neither owns it: the
//! scrobbler parks a failed submission with a `next_attempt_at` it compares
//! against the local clock, and the Discord presence card anchors its countdown
//! and its fifteen-second rate-limit window to the same instant. Phase 12 landed
//! them in parallel, so the helper stayed in `scrobble::service` and
//! `discord::service` re-exported it across a module boundary it has no other
//! reason to cross — a coupling the lane's own note flagged for whoever merged
//! them.
//!
//! This is that shared location. It **re-exports** rather than redefines:
//! Phase 14 moved the identical function into [`shiranami_core::time`] along
//! with the ISO-8601 parser it shipped beside, and two spellings of one clock is
//! exactly the drift the workspace keeps a single vocabulary to avoid.
//!
//! Semantics, unchanged from what both modules were built against: an instant
//! before the epoch reads as `0` rather than as a negative, so a machine whose
//! clock is set before 1970 parks every scrobble as due *now* instead of due in
//! the far future.

pub use shiranami_core::time::now_ms;
