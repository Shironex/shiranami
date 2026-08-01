//! External binaries and everything that comes down through them.
//!
//! `shiranami-downloader` owns the yt-dlp and ffmpeg binary managers (download,
//! chmod, macOS quarantine removal, zip extraction), hardened child-process
//! spawning (`--ignore-config`, the `--` argument guard, failure
//! classification, `kill_on_drop(true)` on every child), the download queue
//! with its concurrency limit, pause/resume, batching and write-through
//! persistence to `download_queue`, and playlist extraction for YouTube and
//! Spotify including the track matcher and its fixture.
//!
//! Ported in Phase 11. An aborted download must delete both `<dest>` and
//! `<dest>.part`. See `docs/v2/architecture.md` §2.2 (#19–#21).
//!
//! # The shape of this crate
//!
//! Everything here is downstream of one fact: **this crate does not control the
//! programs it depends on.** yt-dlp changes its output between releases,
//! YouTube changes what it refuses, Spotify changes its embed page, and any of
//! the three can be absent from the machine entirely. Three design consequences
//! follow, and the modules are organised around them:
//!
//! - **Every external process goes through a trait.** [`spawn::ProcessRunner`]
//!   exists so the queue's state machine, the failure classifier and the
//!   argument guards can all be tested with no yt-dlp installed. The tests that
//!   do want the real binary are gated on its presence and skip otherwise, so
//!   CI stays hermetic.
//! - **The queue's transitions are pure.** `queue::state` is a synchronous
//!   state machine returning effects; the async driver applies them. Every
//!   state and transition v1 had is reachable in a unit test with no I/O, no
//!   timers and no database.
//! - **Parsing is defensive and pinned.** The yt-dlp JSON reader and the
//!   Spotify embed parser reproduce v1's fallback ladders exactly, including
//!   the parts that look like bugs, because the renderer's behaviour is built
//!   on what they return today.

// Every item here is either renderer-visible contract, a ported guard, or the
// vocabulary the composition root wires together. An undocumented one is a
// contract nobody can read, so this crate gates on documentation the way
// `shiranami-core` and `shiranami-net` do.
#![warn(missing_docs)]

pub mod bin;
pub mod download;
pub mod error;
pub mod extract;
pub mod queue;
pub mod spawn;

#[cfg(test)]
pub(crate) mod testing;

pub use error::{DownloaderError, Result};
