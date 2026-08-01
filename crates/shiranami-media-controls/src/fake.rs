//! Test doubles shared by the unit suites in this crate.
//!
//! The OS-facing half of this crate cannot be exercised in CI — SMTC needs a
//! real window and `MPNowPlayingInfoCenter` needs a real app bundle — so the
//! boundary is drawn at [`crate::backend::MediaControlsBackend`] and everything
//! above it is tested against [`RecordingBackend`]. That is the whole point of
//! the trait: the mapping, the routing and the coalescing are the parts with
//! decisions in them, and none of them should need a desktop to verify.

use std::cell::RefCell;

use crate::backend::{CommandSink, MediaControlsBackend};
use crate::error::{MediaControlsError, Result};
use crate::os::{OsMetadata, OsPlayback};
use crate::state::NowPlaying;

/// A representative track, playing from the start.
pub(crate) fn track() -> NowPlaying {
    NowPlaying {
        is_playing: true,
        title: "Sakura Nights".to_owned(),
        artist: "Yumemi".to_owned(),
        album: "Hazy Tapes".to_owned(),
        duration: 214.0,
        current_time: 0.0,
        album_art: Some("http://127.0.0.1:52341/tok/art/abcdef.jpg".to_owned()),
    }
}

/// [`track`] with the playhead moved to `current_time` seconds.
pub(crate) fn playing(current_time: f64) -> NowPlaying {
    NowPlaying {
        current_time,
        ..track()
    }
}

/// Everything a backend was asked to do, in order.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum BackendCall {
    /// [`MediaControlsBackend::attach`].
    Attach,
    /// [`MediaControlsBackend::detach`].
    Detach,
    /// [`MediaControlsBackend::set_metadata`].
    Metadata(OsMetadata),
    /// [`MediaControlsBackend::set_playback`].
    Playback(OsPlayback),
}

/// A backend that records instead of touching the OS.
///
/// Interior mutability so a test can read the log while the service still holds
/// the backend by value; `RefCell` rather than `Mutex` because nothing here
/// crosses a thread.
#[derive(Debug, Default)]
pub(crate) struct RecordingBackend {
    calls: RefCell<Vec<BackendCall>>,
    fail_next: RefCell<bool>,
    sink: RefCell<Option<CommandSink>>,
}

impl RecordingBackend {
    /// A backend that accepts everything.
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Everything it has been asked to do so far.
    pub(crate) fn calls(&self) -> Vec<BackendCall> {
        self.calls.borrow().clone()
    }

    /// Only the metadata pushes, in order.
    pub(crate) fn metadata_pushes(&self) -> Vec<OsMetadata> {
        self.calls
            .borrow()
            .iter()
            .filter_map(|call| match call {
                BackendCall::Metadata(metadata) => Some(metadata.clone()),
                _ => None,
            })
            .collect()
    }

    /// Only the playback pushes, in order.
    pub(crate) fn playback_pushes(&self) -> Vec<OsPlayback> {
        self.calls
            .borrow()
            .iter()
            .filter_map(|call| match call {
                BackendCall::Playback(playback) => Some(playback.clone()),
                _ => None,
            })
            .collect()
    }

    /// Make the next OS write fail, the way a detached SMTC does.
    pub(crate) fn fail_next(&self) {
        *self.fail_next.borrow_mut() = true;
    }

    /// Deliver a command as if the OS had raised it.
    pub(crate) fn emit(&self, command: crate::command::MediaCommand) {
        if let Some(sink) = self.sink.borrow().as_ref() {
            sink.send(command);
        }
    }

    fn record(&self, call: BackendCall) -> Result<()> {
        if std::mem::replace(&mut *self.fail_next.borrow_mut(), false) {
            return Err(MediaControlsError::Backend("recorded failure".to_owned()));
        }
        self.calls.borrow_mut().push(call);
        Ok(())
    }
}

impl MediaControlsBackend for RecordingBackend {
    fn attach(&mut self, sink: CommandSink) -> Result<()> {
        *self.sink.borrow_mut() = Some(sink);
        self.record(BackendCall::Attach)
    }

    fn detach(&mut self) -> Result<()> {
        *self.sink.borrow_mut() = None;
        self.record(BackendCall::Detach)
    }

    fn set_metadata(&mut self, metadata: &OsMetadata) -> Result<()> {
        self.record(BackendCall::Metadata(metadata.clone()))
    }

    fn set_playback(&mut self, playback: &OsPlayback) -> Result<()> {
        self.record(BackendCall::Playback(playback.clone()))
    }
}
