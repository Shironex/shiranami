//! The watcher thread's loop: receive, attribute, coalesce, report.
//!
//! [`crate::watch::service`] owns the thread and its channels; this module is
//! what runs on it.
//!
//! # Watches are re-armed, not trusted
//!
//! A watch can die without a word. `notify`'s Windows backend drops a
//! directory's watch on an unexpected ReadDirectoryChangesW error or
//! `ACCESS_DENIED` and emits nothing, so a folder that merely *looks* watched
//! would stay deaf until the next launch. Two cheap defences:
//!
//! - every root refresh re-watches every root, not only the new ones;
//! - with [`Timing::rearm`] set (Windows by default), every root that exists is
//!   re-watched on that period, which also retries a folder whose drive has come
//!   back.
//!
//! macOS gets the first and not the second: FSEvents does not drop a stream
//! silently, and re-creating one opens a short window in which events are lost.
//!
//! # Probing runs on the tick
//!
//! [`Coalescer::drain_due`] probes files, and a storm delivers thousands of
//! events a second. The drain therefore runs at most once per [`Timing::tick`],
//! however fast events arrive.

use std::collections::HashSet;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use super::backend::{Message, RawEvent, WatchBackend};
use super::coalesce::{Coalescer, Fingerprint, Probe, Timing};
use super::filter::{Existence, classify};
use super::roots::{RootIndex, WatchRoot};
use super::service::BatchSink;

/// How long an idle thread sleeps between looks at its flags when no re-arm
/// period is set. Control messages wake it sooner.
const IDLE_WAIT: Duration = Duration::from_secs(60);

/// What the handle sends the thread, apart from events.
#[derive(Debug)]
pub(crate) enum Control {
    /// The set of folders to watch, replacing the previous one.
    Roots(Vec<WatchRoot>),
    /// Shut down.
    Stop,
}

/// The channels and flags the thread reads.
pub(crate) struct Inbox {
    pub(crate) events: mpsc::Receiver<Message>,
    pub(crate) control: mpsc::Receiver<Control>,
    pub(crate) overflow: Arc<AtomicBool>,
    pub(crate) done: mpsc::SyncSender<()>,
}

/// Set by the handle when it stops. Checked right before a batch is handed on,
/// so a thread that was detached after a stop timeout (stuck in a probe on a
/// dead drive) cannot emit into an app that is shutting down once it unsticks.
pub(crate) type Stopped = Arc<AtomicBool>;

/// The thread's state.
pub(crate) struct Worker<B> {
    backend: B,
    sink: BatchSink,
    timing: Timing,
    coalescer: Coalescer,
    index: RootIndex,
    watched: HashSet<PathBuf>,
    last_flush: Instant,
    last_rearm: Instant,
    stopped: Stopped,
}

impl<B: WatchBackend> Worker<B> {
    pub(crate) fn new(backend: B, timing: Timing, sink: BatchSink, stopped: Stopped) -> Self {
        let now = Instant::now();
        Self {
            backend,
            sink,
            timing,
            coalescer: Coalescer::new(timing),
            index: RootIndex::default(),
            watched: HashSet::new(),
            last_flush: now,
            last_rearm: now,
            stopped,
        }
    }

    pub(crate) fn run(mut self, inbox: &Inbox) {
        'run: loop {
            let wait = if self.coalescer.is_idle() {
                self.timing.rearm.unwrap_or(IDLE_WAIT)
            } else {
                self.timing.tick
            };

            match inbox.events.recv_timeout(wait) {
                Ok(Message::Event(event)) => self.record(&event),
                Ok(Message::Rescan(paths)) => self.rescan(&paths),
                Ok(Message::Wake) | Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }

            while let Ok(control) = inbox.control.try_recv() {
                match control {
                    Control::Roots(roots) => self.apply(roots),
                    Control::Stop => break 'run,
                }
            }

            if inbox.overflow.swap(false, Ordering::Relaxed) {
                tracing::warn!("the folder watcher fell behind; rescanning every watched folder");
                self.rescan(&[]);
            }

            let now = Instant::now();
            if self
                .timing
                .rearm
                .is_some_and(|period| now.saturating_duration_since(self.last_rearm) >= period)
            {
                self.last_rearm = now;
                self.rearm_existing();
            }
            if now.saturating_duration_since(self.last_flush) >= self.timing.tick {
                self.last_flush = now;
                self.flush();
            }
        }

        for path in std::mem::take(&mut self.watched) {
            self.backend.unwatch(&path);
        }
        tracing::debug!("the folder watcher stopped");
        let _ = inbox.done.try_send(());
    }

    fn record(&mut self, event: &RawEvent) {
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

    /// Mark the folders a "events were lost" signal covers. Only folders that
    /// are actually watched: one that failed to watch has had no events to
    /// lose, and the user was told its changes need a manual rescan.
    fn rescan(&mut self, paths: &[PathBuf]) {
        let ids: Vec<String> = if paths.is_empty() {
            self.index.ids().map(str::to_owned).collect()
        } else {
            let mut ids: Vec<String> = paths
                .iter()
                .flat_map(|path| self.index.touching(path))
                .map(str::to_owned)
                .collect();
            ids.sort_unstable();
            ids.dedup();
            ids
        };
        let watched: Vec<&str> = ids
            .iter()
            .map(String::as_str)
            .filter(|id| {
                self.index
                    .path_of(id)
                    .is_some_and(|path| self.watched.contains(path))
            })
            .collect();
        self.coalescer.record_all(watched, Instant::now());
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

        let paths: Vec<PathBuf> = roots.iter().map(|root| root.path.clone()).collect();
        self.index = RootIndex::new(&roots);
        for path in &paths {
            self.arm(path);
        }
        tracing::info!(
            folders = roots.len(),
            watched = self.watched.len(),
            "the folder watcher's roots were updated"
        );
    }

    /// Re-watch every root whose folder exists. See the module docs.
    fn rearm_existing(&mut self) {
        let paths: Vec<PathBuf> = self
            .index
            .ids()
            .filter_map(|id| self.index.path_of(id))
            .filter(|path| path.is_dir())
            .map(Path::to_path_buf)
            .collect();
        for path in &paths {
            self.arm(path);
        }
    }

    /// Watch `path`, dropping any previous watch on it first so a watch the OS
    /// silently lost is replaced rather than assumed.
    fn arm(&mut self, path: &Path) {
        if self.watched.remove(path) {
            self.backend.unwatch(path);
        }
        match self.backend.watch(path) {
            Ok(()) => {
                self.watched.insert(path.to_path_buf());
            }
            Err(error) => tracing::warn!(
                folder = %path.display(),
                %error,
                "could not watch a music folder; its changes will need a manual rescan"
            ),
        }
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

        if self.stopped.load(Ordering::Relaxed) {
            return;
        }
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
