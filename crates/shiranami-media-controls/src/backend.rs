//! The seam between this crate and the operating system.
//!
//! Everything below [`MediaControlsBackend`] is untestable by design — SMTC
//! wants a live window handle, `MPNowPlayingInfoCenter` wants a real app bundle,
//! and neither exists on a CI runner. So the trait is drawn as thin as the OS
//! surface actually is (four methods, no state of its own) and every decision
//! worth arguing about is kept above it, where a test can reach it.
//!
//! # Thread affinity
//!
//! The trait deliberately carries no `Send` or `Sync` bound. Windows'
//! `SystemMediaTransportControls` is obtained through `GetForWindow` and belongs
//! to the thread that owns that window, so the correct place for a backend is
//! the main thread — and a `Send` bound would advertise a freedom that platform
//! does not have. The shell keeps the backend on the main thread and talks to
//! the rest of the app through [`CommandSink`], which *is* `Send + Sync`,
//! because the OS raises commands on its own thread.

use std::fmt;
use std::sync::Arc;

use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};

use crate::command::MediaCommand;
use crate::error::Result;
use crate::os::{OsMetadata, OsPlayback};

/// An OS now-playing surface.
pub trait MediaControlsBackend {
    /// Start delivering remote commands to `sink`, and enable the OS buttons.
    fn attach(&mut self, sink: CommandSink) -> Result<()>;

    /// Stop delivering commands and disable the OS buttons.
    fn detach(&mut self) -> Result<()>;

    /// Replace the displayed metadata.
    fn set_metadata(&mut self, metadata: &OsMetadata) -> Result<()>;

    /// Replace the playback status and playhead.
    fn set_playback(&mut self, playback: &OsPlayback) -> Result<()>;
}

/// Where a backend delivers the commands the user pressed.
///
/// A callback rather than a bare channel because souvlaki hands us a
/// synchronous `Fn(MediaControlEvent) + Send + 'static` and the shell may want
/// to do something other than enqueue — emit a Tauri event, log, drop under
/// `SHIRANAMI_E2E=1`. [`CommandSink::channel`] gives the channel form for the
/// callers that do want one.
#[derive(Clone)]
pub struct CommandSink(Arc<dyn Fn(MediaCommand) + Send + Sync>);

impl CommandSink {
    /// Deliver commands to `handler`.
    pub fn from_fn<F>(handler: F) -> Self
    where
        F: Fn(MediaCommand) + Send + Sync + 'static,
    {
        Self(Arc::new(handler))
    }

    /// Deliver commands to a channel.
    ///
    /// Unbounded because the sending side is an OS callback: on Windows the
    /// SMTC button handler runs on a WinRT thread that is waiting for us to
    /// return, and on macOS the block runs on the main queue. Neither may block
    /// on a full queue, and there are at most a handful of commands a second —
    /// a human is pressing them.
    pub fn channel() -> (Self, UnboundedReceiver<MediaCommand>) {
        let (sender, receiver) = unbounded_channel();

        let sink = Self::from_fn(move |command| {
            // The receiver is gone only during shutdown, when there is by
            // definition nothing left to act on the command.
            let _ = sender.send(command);
        });

        (sink, receiver)
    }

    /// Deliver one command.
    pub fn send(&self, command: MediaCommand) {
        (self.0)(command);
    }
}

impl fmt::Debug for CommandSink {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CommandSink")
    }
}

/// A backend that accepts everything and does nothing.
///
/// Two callers. Linux, where souvlaki is not compiled at all and there is no OS
/// surface to write to; and `SHIRANAMI_E2E=1`, which §2.8 requires to disable
/// media controls — a null backend keeps the shell's wiring identical between
/// the two modes instead of making every call site optional.
#[derive(Debug, Default)]
pub struct NullBackend;

impl MediaControlsBackend for NullBackend {
    fn attach(&mut self, _sink: CommandSink) -> Result<()> {
        Ok(())
    }

    fn detach(&mut self) -> Result<()> {
        Ok(())
    }

    fn set_metadata(&mut self, _metadata: &OsMetadata) -> Result<()> {
        Ok(())
    }

    fn set_playback(&mut self, _playback: &OsPlayback) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn a_callback_sink_forwards_every_command() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = {
            let seen = Arc::clone(&seen);
            CommandSink::from_fn(move |command| {
                if let Ok(mut seen) = seen.lock() {
                    seen.push(command);
                }
            })
        };

        sink.send(MediaCommand::TogglePlay);
        sink.send(MediaCommand::Next);

        let seen = seen.lock().expect("the sink did not poison the lock");
        assert_eq!(*seen, [MediaCommand::TogglePlay, MediaCommand::Next]);
    }

    #[test]
    fn a_channel_sink_queues_in_order() {
        let (sink, mut receiver) = CommandSink::channel();

        sink.send(MediaCommand::Previous);
        sink.send(MediaCommand::SeekTo { position: 12.0 });

        assert_eq!(receiver.try_recv().ok(), Some(MediaCommand::Previous));
        assert_eq!(
            receiver.try_recv().ok(),
            Some(MediaCommand::SeekTo { position: 12.0 })
        );
        assert!(receiver.try_recv().is_err(), "nothing else was sent");
    }

    /// The OS keeps pressing buttons during shutdown; a dropped receiver must
    /// not turn that into a panic on a WinRT callback thread.
    #[test]
    fn sending_after_the_receiver_is_gone_is_silent() {
        let (sink, receiver) = CommandSink::channel();
        drop(receiver);

        sink.send(MediaCommand::Stop);
    }

    #[test]
    fn a_sink_can_be_shared() {
        let (sink, mut receiver) = CommandSink::channel();
        let clone = sink.clone();

        sink.send(MediaCommand::Play);
        clone.send(MediaCommand::Pause);

        assert_eq!(receiver.try_recv().ok(), Some(MediaCommand::Play));
        assert_eq!(receiver.try_recv().ok(), Some(MediaCommand::Pause));
    }

    #[test]
    fn the_null_backend_accepts_everything() {
        let mut backend = NullBackend;
        let (sink, _receiver) = CommandSink::channel();

        assert!(backend.attach(sink).is_ok());
        assert!(backend.set_metadata(&OsMetadata::default()).is_ok());
        assert!(backend.set_playback(&OsPlayback::Stopped).is_ok());
        assert!(backend.detach().is_ok());
    }
}
