//! Opt-in automatic updates for the managed yt-dlp and ffmpeg.
//!
//! [`policy`] decides when a tool is due and what an outcome does to the
//! persisted record, with no I/O at all; [`run`] performs one update, holding
//! the download queue only for the swap. Scheduling, the setting itself and
//! telling the user are the composition root's: this crate has no clock task
//! and no settings store of its own.

pub mod policy;
pub mod run;

pub use policy::{Consequence, UpdateOutcome};
pub use run::{QUIESCE_LIMIT, QueueGate, SwapGate, update_tool};
