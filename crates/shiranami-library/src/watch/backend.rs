//! The OS side of the watcher, behind a seam.
//!
//! [`WatchBackend`] is the two operations the service needs from a platform
//! watcher: start watching a folder recursively, and stop. [`NotifyBackend`] is
//! the real one over `notify`'s recommended watcher (FSEvents on macOS,
//! ReadDirectoryChangesW on Windows, inotify on Linux). Tests drive the service
//! through a fake, so the lifecycle rules (retry a folder that failed, unwatch a
//! removed one, stop cleanly) are pinned without depending on how quickly a
//! given OS delivers events.
//!
//! # Events cross a channel, not a lock
//!
//! `notify` calls its handler on its own thread. The handler does nothing but
//! translate the event and send it to the service's thread through an
//! [`EventSender`], so a slow `stat` or a probe never runs on the OS watcher's
//! thread.
//!
//! The channel is **bounded**. If the service thread falls behind (a stale
//! network share stalling its probes) the queue does not grow without limit and
//! the OS watcher's thread is never blocked: a send that would overflow sets a
//! flag instead, and the service treats the flag as "events were lost" for every
//! watched folder, which is what it would have been told anyway.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, TrySendError};

use notify::event::ModifyKind;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher as _};

use super::filter::RawKind;

/// One event, as the service consumes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawEvent {
    /// What happened.
    pub kind: RawKind,
    /// The paths it happened to. A rename can carry both ends.
    pub paths: Vec<PathBuf>,
}

/// What the service's thread receives on the event channel.
#[derive(Debug)]
pub(crate) enum Message {
    /// A filesystem event from the backend.
    Event(RawEvent),
    /// The backend lost events under these paths. Empty means it cannot say
    /// where, and every watched folder is changed.
    Rescan(Vec<PathBuf>),
    /// Nothing happened: look at the control channel.
    Wake,
}

/// The handle a backend reports events through.
///
/// Cheap to clone. Sending after the service has stopped is a silent no-op: the
/// OS watcher can deliver a last event while it is being torn down, and that
/// is not an error. Sending into a full queue sets the overflow flag instead of
/// blocking (see the module docs).
#[derive(Debug, Clone)]
pub struct EventSender {
    pub(crate) sender: mpsc::SyncSender<Message>,
    pub(crate) overflow: Arc<AtomicBool>,
}

impl EventSender {
    /// Report an event.
    pub fn event(&self, event: RawEvent) {
        self.send(Message::Event(event));
    }

    /// Report that events were lost under `paths`, or anywhere if it is empty.
    pub fn rescan(&self, paths: Vec<PathBuf>) {
        self.send(Message::Rescan(paths));
    }

    pub(crate) fn wake(&self) {
        // A full queue will wake the thread anyway.
        let _ = self.sender.try_send(Message::Wake);
    }

    fn send(&self, message: Message) {
        if let Err(TrySendError::Full(_)) = self.sender.try_send(message) {
            self.overflow.store(true, Ordering::Relaxed);
        }
    }
}

/// A platform watcher the service can point at folders.
pub trait WatchBackend: Send + 'static {
    /// Start watching `path` and everything under it.
    ///
    /// # Errors
    ///
    /// A human-readable reason when the folder cannot be watched: it does not
    /// exist, the drive is gone, the OS refused.
    fn watch(&mut self, path: &Path) -> Result<(), String>;

    /// Stop watching `path`. Unwatching something not watched is a no-op.
    fn unwatch(&mut self, path: &Path);
}

/// The real backend, over `notify`'s recommended watcher for this platform.
pub struct NotifyBackend {
    watcher: RecommendedWatcher,
}

impl NotifyBackend {
    /// Create the OS watcher, forwarding every event to `events`.
    ///
    /// # Errors
    ///
    /// The OS refused to create a watcher. On macOS and Windows this does not
    /// happen in practice; on Linux it is the inotify instance limit.
    pub fn new(events: EventSender) -> Result<Self, String> {
        let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            forward(&events, result);
        })
        .map_err(|error| error.to_string())?;
        Ok(Self { watcher })
    }
}

impl WatchBackend for NotifyBackend {
    fn watch(&mut self, path: &Path) -> Result<(), String> {
        self.watcher
            .watch(path, RecursiveMode::Recursive)
            .map_err(|error| error.to_string())
    }

    fn unwatch(&mut self, path: &Path) {
        if let Err(error) = self.watcher.unwatch(path) {
            // A folder whose drive has gone cannot be unwatched either, and
            // there is nothing to do about it beyond saying so.
            tracing::debug!(%error, path = %path.display(), "could not unwatch a folder");
        }
    }
}

/// Translate one `notify` result and send it on.
fn forward(events: &EventSender, result: notify::Result<notify::Event>) {
    match result {
        // FSEvents' `MustScanSubDirs` carries the directory it gave up on, so
        // the rescan can be scoped to the folder that owns it.
        Ok(event) if event.need_rescan() => events.rescan(event.paths),
        Ok(event) => events.event(RawEvent {
            kind: raw_kind(event.kind),
            paths: event.paths,
        }),
        Err(error) => {
            // An error may name the path it is about; when it does not, every
            // watched folder is rescanned. That is safe: the rescan only finds
            // what is really on disk, and the renderer refuses deletions from a
            // folder that has gone missing. Not every loss arrives here: notify
            // 8.2's Windows backend drops a buffer overflow, and a watch it
            // gives up on, without reporting anything, and on Linux a root that
            // is unmounted or replaced takes its inotify watch with it. That is
            // what `worker`'s periodic re-arm is for.
            tracing::warn!(%error, "the folder watcher reported an error");
            events.rescan(error.paths);
        }
    }
}

/// `notify`'s kind, reduced to what the classifier distinguishes.
fn raw_kind(kind: EventKind) -> RawKind {
    match kind {
        EventKind::Access(_) => RawKind::Access,
        EventKind::Create(_) => RawKind::Create,
        EventKind::Modify(ModifyKind::Name(_)) => RawKind::Rename,
        EventKind::Modify(_) => RawKind::Modify,
        EventKind::Remove(_) => RawKind::Remove,
        EventKind::Any | EventKind::Other => RawKind::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, Flag, RemoveKind, RenameMode};

    #[test]
    fn every_rename_shape_is_one_kind() {
        for mode in [
            RenameMode::Any,
            RenameMode::From,
            RenameMode::To,
            RenameMode::Both,
        ] {
            assert_eq!(
                raw_kind(EventKind::Modify(ModifyKind::Name(mode))),
                RawKind::Rename
            );
        }
        assert_eq!(
            raw_kind(EventKind::Modify(ModifyKind::Any)),
            RawKind::Modify
        );
        assert_eq!(
            raw_kind(EventKind::Access(AccessKind::Any)),
            RawKind::Access
        );
        assert_eq!(
            raw_kind(EventKind::Create(CreateKind::File)),
            RawKind::Create
        );
        assert_eq!(
            raw_kind(EventKind::Remove(RemoveKind::Folder)),
            RawKind::Remove
        );
    }

    fn channel(capacity: usize) -> (EventSender, mpsc::Receiver<Message>) {
        let (sender, receiver) = mpsc::sync_channel(capacity);
        let events = EventSender {
            sender,
            overflow: Arc::new(AtomicBool::new(false)),
        };
        (events, receiver)
    }

    #[test]
    fn a_lost_events_flag_becomes_a_rescan_of_its_path() {
        let (events, receiver) = channel(8);

        forward(
            &events,
            Ok(notify::Event::new(EventKind::Other)
                .set_flag(Flag::Rescan)
                .add_path("/m/deep".into())),
        );
        forward(
            &events,
            Ok(notify::Event::new(EventKind::Create(CreateKind::File)).add_path("/m/a.mp3".into())),
        );

        assert!(matches!(
            receiver.recv(),
            Ok(Message::Rescan(ref paths)) if paths == &[PathBuf::from("/m/deep")]
        ));
        assert!(matches!(
            receiver.recv(),
            Ok(Message::Event(RawEvent { kind: RawKind::Create, ref paths })) if paths == &[PathBuf::from("/m/a.mp3")]
        ));
    }

    #[test]
    fn a_full_queue_sets_the_overflow_flag_instead_of_blocking() {
        let (events, _receiver) = channel(1);
        let event = || RawEvent {
            kind: RawKind::Create,
            paths: vec![PathBuf::from("/m/a.mp3")],
        };

        events.event(event());
        assert!(!events.overflow.load(Ordering::Relaxed));
        events.event(event());
        assert!(events.overflow.load(Ordering::Relaxed));
    }
}
