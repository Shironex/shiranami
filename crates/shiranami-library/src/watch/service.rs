//! The running watcher: one thread, one OS watcher, one coalescer.
//!
//! [`FolderWatcher`] owns a dedicated thread that receives events, attributes
//! them to a folder, coalesces them, and hands each ready batch of folder ids to
//! a sink. The shell's sink emits `library:folders-changed`; this crate knows
//! nothing about Tauri, the database or the renderer.
//!
//! # A thread, not a task
//!
//! The work here is `stat` and `open` calls on the event path and a timer, all
//! blocking and all cheap. A plain thread keeps them off the async runtime, and
//! `notify` itself already delivers on a thread of its own.
//!
//! # A folder that cannot be watched degrades, never fails
//!
//! A missing drive, a network share the OS will not watch, a permissions error:
//! each is logged and the folder is simply not watched. It is retried the next
//! time the root set is applied (a folder added or removed, the setting
//! toggled, the next launch), and a manual rescan still works for it
//! throughout.
//!
//! # A missing folder is never reported
//!
//! Unmounting a drive makes every file on it look deleted, and a rescan of a
//! folder that is not there would validate its tracks as missing and remove
//! them, taking play counts and playlist entries with them. So a batch is only
//! handed on for folders whose root still exists. Removing a whole library
//! folder from disk is left to the user's own rescan, which is the decision a
//! person should make.

use std::collections::HashSet;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Mutex, PoisonError};
use std::thread::JoinHandle;
use std::time::Instant;

use super::backend::{EventSender, Message, NotifyBackend, RawEvent, WatchBackend};
use super::coalesce::{Coalescer, Fingerprint, Probe, Timing};
use super::filter::{Existence, classify};
use super::roots::{RootIndex, WatchRoot};

/// Where ready batches go: the ids of the folders that changed, in id order.
pub type BatchSink = Box<dyn FnMut(Vec<String>) + Send>;

/// The watcher could not start at all.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum WatchError {
    /// The OS watcher could not be created.
    #[error("could not create the folder watcher: {0}")]
    Backend(String),
    /// The watcher thread could not be spawned.
    #[error("could not start the folder watcher thread: {0}")]
    Thread(String),
}

/// A running folder watcher. Stops on [`FolderWatcher::stop`] or on drop.
pub struct FolderWatcher {
    sender: mpsc::Sender<Message>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl FolderWatcher {
    /// Start a watcher over the platform's native backend, watching nothing
    /// until [`FolderWatcher::set_roots`] is called.
    ///
    /// # Errors
    ///
    /// [`WatchError`] when the OS watcher or its thread cannot be created. The
    /// caller carries on without live watching; a manual rescan still works.
    pub fn start_native(timing: Timing, sink: BatchSink) -> Result<Self, WatchError> {
        Self::start(timing, sink, NotifyBackend::new)
    }

    /// Start a watcher over any backend. `backend` is given the sender its
    /// events go to.
    ///
    /// # Errors
    ///
    /// As [`FolderWatcher::start_native`].
    pub fn start<B: WatchBackend>(
        timing: Timing,
        sink: BatchSink,
        backend: impl FnOnce(EventSender) -> Result<B, String>,
    ) -> Result<Self, WatchError> {
        let (sender, receiver) = mpsc::channel();
        let backend = backend(EventSender(sender.clone())).map_err(WatchError::Backend)?;

        let thread = std::thread::Builder::new()
            .name("shiranami-folder-watch".to_owned())
            .spawn(move || Worker::new(backend, timing, sink).run(&receiver))
            .map_err(|error| WatchError::Thread(error.to_string()))?;

        Ok(Self {
            sender,
            thread: Mutex::new(Some(thread)),
        })
    }

    /// Replace the watched set. Folders no longer listed are unwatched and any
    /// pending batch for them is dropped; new ones are watched; ones that
    /// failed before are retried.
    pub fn set_roots(&self, roots: Vec<WatchRoot>) {
        let _ = self.sender.send(Message::Roots(roots));
    }

    /// Stop the watcher and wait for its thread. Idempotent.
    pub fn stop(&self) {
        let thread = self
            .thread
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        let Some(thread) = thread else {
            return;
        };
        let _ = self.sender.send(Message::Stop);
        if thread.join().is_err() {
            tracing::warn!("the folder watcher thread panicked");
        }
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

/// The thread's state.
struct Worker<B> {
    backend: B,
    sink: BatchSink,
    timing: Timing,
    coalescer: Coalescer,
    index: RootIndex,
    watched: HashSet<PathBuf>,
}

impl<B: WatchBackend> Worker<B> {
    fn new(backend: B, timing: Timing, sink: BatchSink) -> Self {
        Self {
            backend,
            sink,
            timing,
            coalescer: Coalescer::new(timing),
            index: RootIndex::default(),
            watched: HashSet::new(),
        }
    }

    fn run(mut self, receiver: &mpsc::Receiver<Message>) {
        loop {
            // Idle means nothing is pending, so there is nothing to time out
            // for and the thread sleeps until the next message.
            let message = if self.coalescer.is_idle() {
                receiver.recv().map_err(|_| RecvTimeoutError::Disconnected)
            } else {
                receiver.recv_timeout(self.timing.tick)
            };

            match message {
                Ok(Message::Event(event)) => self.record(event),
                Ok(Message::Rescan) => {
                    let ids: Vec<String> = self.index.ids().map(str::to_owned).collect();
                    self.coalescer
                        .record_all(ids.iter().map(String::as_str), Instant::now());
                }
                Ok(Message::Roots(roots)) => self.apply(roots),
                Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }

            self.flush();
        }

        for path in std::mem::take(&mut self.watched) {
            self.backend.unwatch(&path);
        }
        tracing::debug!("the folder watcher stopped");
    }

    fn record(&mut self, event: RawEvent) {
        let now = Instant::now();
        for path in &event.paths {
            let Some(id) = self.index.attribute(path) else {
                continue;
            };
            let Some(existence) = existence_of(path) else {
                continue;
            };
            if let Some(change) = classify(event.kind, path, existence) {
                self.coalescer.record(id, change, now);
            }
        }
    }

    fn apply(&mut self, roots: Vec<WatchRoot>) {
        let wanted: HashSet<&Path> = roots.iter().map(|root| root.path.as_path()).collect();

        let stale: Vec<PathBuf> = self
            .watched
            .iter()
            .filter(|path| !wanted.contains(path.as_path()))
            .cloned()
            .collect();
        for path in stale {
            self.backend.unwatch(&path);
            self.watched.remove(&path);
        }

        for root in &roots {
            if self.watched.contains(&root.path) {
                continue;
            }
            match self.backend.watch(&root.path) {
                Ok(()) => {
                    self.watched.insert(root.path.clone());
                }
                Err(error) => tracing::warn!(
                    folder = %root.path.display(),
                    %error,
                    "could not watch a music folder; its changes will need a manual rescan"
                ),
            }
        }

        let kept: HashSet<&str> = roots.iter().map(|root| root.id.as_str()).collect();
        let dropped: Vec<String> = self
            .index
            .ids()
            .filter(|id| !kept.contains(id))
            .map(str::to_owned)
            .collect();
        for id in dropped {
            self.coalescer.forget(&id);
        }

        self.index = RootIndex::new(&roots);
        tracing::info!(
            folders = roots.len(),
            watched = self.watched.len(),
            "the folder watcher's roots were updated"
        );
    }

    fn flush(&mut self) {
        let due = self.coalescer.drain_due(Instant::now(), probe);
        let present: Vec<String> = due
            .into_iter()
            .filter(|id| {
                let present = self.index.path_of(id).is_some_and(Path::is_dir);
                if !present {
                    tracing::info!(folder = %id, "a watched folder is not reachable; not rescanning it");
                }
                present
            })
            .collect();

        if !present.is_empty() {
            tracing::debug!(folders = ?present, "watched folders changed");
            (self.sink)(present);
        }
    }
}

/// What is at `path` now, or `None` for something the scan would skip anyway.
///
/// `symlink_metadata` so that a symlink is seen as itself: the scan walks with
/// `follow_links` off and never imports through one.
fn existence_of(path: &Path) -> Option<Existence> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() => Some(Existence::File),
        Ok(metadata) if metadata.is_dir() => Some(Existence::Dir),
        Ok(_) => None,
        Err(_) => Some(Existence::Gone),
    }
}

/// The real probe behind the size-stability gate.
///
/// Opening the file is part of the probe on purpose. On Windows a copy in
/// progress holds the destination with a handle that refuses readers, and the
/// length may already be final, so "can it be opened?" is the signal the size
/// alone would miss. Elsewhere the open succeeds and costs one syscall.
fn probe(path: &Path) -> Probe {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return Probe::Gone,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Probe::Gone,
        Err(_) => return Probe::Busy,
    };
    if File::open(path).is_err() {
        return Probe::Busy;
    }
    Probe::Ready(Fingerprint {
        len: metadata.len(),
        modified: metadata.modified().ok(),
    })
}
