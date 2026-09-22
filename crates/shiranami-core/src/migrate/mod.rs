//! First-run data continuity: the v1 (Electron) tree, copied into the v2
//! (Tauri) one (architecture §3.1, decision D13, risk R6).
//!
//! Tauri derives its data directory from the bundle identifier and Electron from
//! the product name, so v2 starts life pointed at an empty directory beside a
//! full one. This module is the bridge, and its contract is three words:
//! **copy, never move**. Nothing here opens a v1 path for writing or unlinks
//! one, because a v1 that still boots is the safety net the whole update
//! handover (§4) rests on — a user who reinstalls v1 must not find an empty app.
//!
//! [`run`] is the entry point and [`Outcome`] is what it answers. The sequence
//! it implements is §3.1's, and [`run`]'s own docs carry the state machine.
//!
//! # Rank 0, deliberately
//!
//! The copy is `std::fs` and `serde_json` and nothing else, which is what lets
//! it run before the settings store loads and long before the database opens.
//! The one thing it cannot do from here is *validate* the copied library —
//! `shiranami-db` is two ranks up. It does not need to: adoption already
//! refuses a database it cannot understand, and Phase 6 made `quick_check`
//! fatal rather than advisory, so a torn copy fails closed at the next stage
//! instead of being adopted.

pub mod backup;
pub mod copy;
pub mod error;
pub mod handoff;
pub mod marker;
pub mod plan;
pub mod run;

pub use error::{MigrateError, Result};
pub use handoff::{Handoff, RendererState};
pub use marker::{MigrationMarker, SkipReason};
pub use plan::{DATABASE_FILE, Discovery};
pub use run::{Migrated, Outcome, run};
