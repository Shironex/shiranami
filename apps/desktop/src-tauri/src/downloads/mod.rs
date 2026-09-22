//! The downloader's composition-root wiring: services, event sinks, queue seams.
//!
//! `shiranami-downloader` is written against traits for everything it cannot
//! own — where a file goes, whether the queue is paused, who hears about
//! progress — and ships **no production implementation of any of them**. It
//! ships `NoSink`, `NoPersistence`, `NoPausedFlag` and `NoProgress`, which are
//! all null objects for its own tests. Supplying the real ones is this module's
//! whole job, and it is the composition root's job because each of the three
//! reaches for something only the shell has: a `tauri::AppHandle` to emit an
//! event through, the `SettingsStore`, and the user's music directory.
//!
//! # Why this is not in `commands/`
//!
//! Five of the six events this lane owns are emitted from *inside* a command,
//! which already has an `AppHandle` in hand. The sixth,
//! `downloader:queue-state`, is not: the queue driver emits it from a
//! background task whenever the queue changes, including while no command is
//! running and including during `hydrate_and_resume` at boot. Its sink must
//! therefore be built when the queue is built, which is Phase 16's `setup()`.
//!
//! So the sinks live beside the queue's other construction pieces rather than
//! beside the commands, and [`crate::state::Deferred`] is where the assembled
//! result lands — the same shape the kickoff gave `serve`, `scrobbler`,
//! `discord` and `media_controls`.
//!
//! # What is deliberately not here
//!
//! No boot sequence. Nothing in this module opens a database, resolves a data
//! directory or starts a task, for the reason `crate::state` gives at length:
//! §2.8's ordering is Phase 16's, and a second definition of it here would be a
//! competing one. Every type below takes its dependencies already built.

pub mod queue;
pub mod services;
pub mod sinks;

// The crate's own doubles are `#[cfg(test)]` or under `tests/support/`, so none
// of them is reachable from here. See the module docs for what that costs.
#[cfg(test)]
pub(crate) mod testing;

pub use queue::{SettingsDownloadDirectory, SettingsPausedFlag};
pub use services::DownloaderServices;
pub use sinks::{
    DependencyInstallEvents, DownloadEvents, ExtractEvents, InstallChannel, InstallPercentEvents,
    QueueEvents,
};
