//! Live folder watching (v2 feature wave, F10): new, removed or moved music in
//! a registered folder reaches the library without a manual rescan.
//!
//! This is not a port. v1 had no watcher of any kind, which the crate docs
//! record; the reconciliation it feeds is still v1's, in the renderer. So the
//! watcher's whole output is a list of folder ids, and the renderer rescans
//! exactly those folders the way its Rescan button would. A watcher that tried
//! to decide what an event *means* for the library would be a second
//! reconciliation to keep in agreement with the first.
//!
//! Read the submodules in the order an event travels: [`backend`] receives it
//! from the OS, [`roots`] attributes it to a folder, [`filter`] decides whether
//! it is a library change, [`coalesce`] batches it per folder behind a quiet
//! window and a size-stability gate, and [`service`] runs all of that on its
//! own thread (the loop itself is `worker`) and hands each batch to the shell.

pub mod backend;
pub mod coalesce;
pub mod filter;
pub mod roots;
pub mod service;
mod worker;

pub use backend::{EventSender, NotifyBackend, RawEvent, WatchBackend};
pub use coalesce::{Coalescer, Fingerprint, Probe, Timing};
pub use filter::{Change, Existence, RawKind, classify, is_ignored, is_partial};
pub use roots::{RootIndex, WatchRoot};
pub use service::{BatchSink, FolderWatcher, STOP_TIMEOUT, WatchError};
