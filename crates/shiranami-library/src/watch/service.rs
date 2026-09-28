//! The running watcher: one thread, one OS watcher, one coalescer.
//!
//! [`FolderWatcher`] owns a dedicated thread (see [`crate::watch::worker`]) that
//! receives events, attributes them to a folder, coalesces them, and hands each
//! ready batch of folder ids to a sink. The shell's sink emits
//! `library:folders-changed`; this crate knows nothing about Tauri, the database
//! or the renderer.
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
//! toggled, the next launch) and, where re-arming is on, periodically. A manual
//! rescan still works for it throughout, and a lost-events signal never covers
//! it.
//!
//! # What the watcher does and does not promise about missing folders
//!
//! A batch is only handed on for folders whose root exists **at the moment the
//! batch is emitted**. That filters the obvious case (a drive already gone when
//! the folder went quiet) and nothing more: the drive can still vanish between
//! the emit and the rescan, or during it, and a stale network share can answer
//! `is_dir` and then fail every read. The guarantee that an unplugged drive
//! does not empty the library is therefore the renderer's, which re-checks each
//! root and refuses a watcher-triggered deletion that looks like a vanished
//! volume, and `crate::validate`'s, which counts only "not found" as missing.
//!
//! # Stopping is bounded
//!
//! [`FolderWatcher::stop`] runs on the quit path. The thread may be stuck in a
//! filesystem call on a dead network share, which can block for minutes, so the
//! stop waits [`STOP_TIMEOUT`] and then detaches the thread and logs it. The
//! process is exiting; a thread parked in the kernel is not worth a hung quit.

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Mutex, PoisonError};
use std::thread::JoinHandle;
use std::time::Duration;

use super::backend::{EventSender, NotifyBackend, WatchBackend};
use super::coalesce::Timing;
use super::roots::WatchRoot;
use super::worker::{Control, Inbox, Worker};

/// Where ready batches go: the ids of the folders that changed, in id order.
pub type BatchSink = Box<dyn FnMut(Vec<String>) + Send>;

/// How many events may queue before the watcher stops queueing and falls back
/// to rescanning every watched folder. A 500-file copy is a few thousand events.
const EVENT_CAPACITY: usize = 8192;

/// How long [`FolderWatcher::stop`] waits for the thread before detaching it.
pub const STOP_TIMEOUT: Duration = Duration::from_millis(1500);

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

/// The thread and the signal it sends when it has finished.
struct Running {
    thread: JoinHandle<()>,
    done: mpsc::Receiver<()>,
}

/// A running folder watcher. Stops on [`FolderWatcher::stop`] or on drop.
pub struct FolderWatcher {
    control: mpsc::Sender<Control>,
    events: EventSender,
    running: Mutex<Option<Running>>,
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
        let (sender, events) = mpsc::sync_channel(EVENT_CAPACITY);
        let (control, control_rx) = mpsc::channel();
        let (done_tx, done) = mpsc::sync_channel(1);
        let overflow = Arc::new(AtomicBool::new(false));
        let handle = EventSender {
            sender,
            overflow: Arc::clone(&overflow),
        };
        let backend = backend(handle.clone()).map_err(WatchError::Backend)?;

        let inbox = Inbox {
            events,
            control: control_rx,
            overflow,
            done: done_tx,
        };
        let thread = std::thread::Builder::new()
            .name("shiranami-folder-watch".to_owned())
            .spawn(move || Worker::new(backend, timing, sink).run(&inbox))
            .map_err(|error| WatchError::Thread(error.to_string()))?;

        Ok(Self {
            control,
            events: handle,
            running: Mutex::new(Some(Running { thread, done })),
        })
    }

    /// Replace the watched set. Folders no longer listed are unwatched and any
    /// pending batch for them is dropped; every listed folder is (re-)watched.
    pub fn set_roots(&self, roots: Vec<WatchRoot>) {
        let _ = self.control.send(Control::Roots(roots));
        self.events.wake();
    }

    /// Stop the watcher, waiting at most [`STOP_TIMEOUT`] for its thread.
    /// Idempotent.
    pub fn stop(&self) {
        let running = self
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        let Some(Running { thread, done }) = running else {
            return;
        };
        let _ = self.control.send(Control::Stop);
        self.events.wake();

        match done.recv_timeout(STOP_TIMEOUT) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => {
                if thread.join().is_err() {
                    tracing::warn!("the folder watcher thread panicked");
                }
            }
            Err(RecvTimeoutError::Timeout) => tracing::warn!(
                "the folder watcher did not stop in time (a folder may be on an unresponsive \
                 drive); leaving its thread to the exiting process"
            ),
        }
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}
