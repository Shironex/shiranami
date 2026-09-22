//! The download queue (architecture §2.2 #20).
//!
//! [`state`] is the transitions, as a pure state machine; [`manager`] performs
//! their effects and owns the child processes; [`persistence`] writes the queue
//! through to `download_queue` so it survives a restart; [`broadcast`] gets
//! snapshots to the renderer without flooding it.

pub mod broadcast;
pub mod manager;
pub mod persistence;
pub mod state;

pub use broadcast::{NoSink, PROGRESS_THROTTLE, SnapshotSink};
pub use manager::{DownloadDirectory, DownloadQueue};
pub use persistence::{
    NoPausedFlag, NoPersistence, PausedFlag, QueuePersistence, SqlitePersistence,
};
pub use state::{Effect, MAX_CONCURRENCY, QueueState};
