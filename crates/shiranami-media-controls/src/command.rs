//! What the user pressed, and what the app should do about it.
//!
//! [`RemoteEvent`] mirrors `souvlaki::MediaControlEvent` variant for variant so
//! the routing below is a pure function — souvlaki itself is only compiled on
//! Windows and macOS (see the crate manifest), and a routing table that could
//! only be tested on two of three CI runners is a routing table that stops being
//! tested.
//!
//! [`MediaCommand`] is the other side: the vocabulary the renderer already
//! speaks. v1 sent four bare strings over `media:command` — `toggle-play`,
//! `next`, `previous`, `stop` — and `useMediaSession.ts` switched on them. Those
//! four serialize to *exactly* those strings here (unit variants of an
//! externally tagged enum are plain JSON strings), so the Phase 15 shim inherits
//! a working switch rather than a translation layer.
//!
//! # Why this file exists at all
//!
//! In v1 the OS reached the app through two unrelated paths: global shortcuts in
//! the main process (`MediaPlayPause` and friends, registered on Windows only)
//! and `navigator.mediaSession.setActionHandler` in the renderer (macOS' entire
//! story). §2.7 deletes both — the webview session is suppressed and the
//! shortcut plugin is demoted to an escape hatch — and souvlaki's remote
//! commands become the single source. This module is where the two v1 vocabularies
//! are merged into one.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// How far an amount-less seek moves the playhead, in seconds.
///
/// souvlaki reports Windows' Rewind and FastForward buttons as
/// `Seek(direction)` with no magnitude, and SMTC enables both unconditionally
/// when a handler is attached — so they are buttons the user can press whether
/// or not we asked for them. v1 has no answer to copy: it registered neither
/// `seekbackward` nor `seekforward` on `navigator.mediaSession`, which means the
/// browser's own default applied, and the Media Session spec fixes that default
/// at 10 seconds. Adopting the same number is the closest thing to "what v1
/// would have done".
pub const DEFAULT_SEEK_OFFSET_SECONDS: f64 = 10.0;

/// Which way a seek goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeekDirection {
    /// Later in the track.
    Forward,
    /// Earlier in the track.
    Backward,
}

/// An event as an OS media surface raised it.
///
/// A structural copy of `souvlaki::MediaControlEvent`. Some variants are
/// unreachable on the platforms shiranami ships — see
/// [`MediaCommand::from_remote`] — and are kept anyway so the conversion in
/// [`crate::souvlaki_backend`] is total and stays that way when souvlaki adds a
/// backend.
#[derive(Debug, Clone, PartialEq)]
pub enum RemoteEvent {
    /// Resume.
    Play,
    /// Pause.
    Pause,
    /// Resume if paused, pause if playing.
    Toggle,
    /// Skip forward one track.
    Next,
    /// Skip back one track.
    Previous,
    /// Stop and unload.
    Stop,
    /// Seek by an unspecified amount.
    Seek(SeekDirection),
    /// Seek by a stated amount.
    SeekBy(SeekDirection, Duration),
    /// Jump to an absolute position.
    SetPosition(Duration),
    /// Set the output volume, 0.0–1.0.
    SetVolume(f64),
    /// Play the given URI.
    OpenUri(String),
    /// Bring the window to the front.
    Raise,
    /// Quit the app.
    Quit,
}

/// What the app should do, in the renderer's vocabulary.
///
/// Externally tagged on purpose: the six unit variants serialize as the bare
/// strings v1's `onCommand` switch already matches on, and only the two seeks —
/// which v1 never had — take an object form.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum MediaCommand {
    /// v1's `'toggle-play'`.
    TogglePlay,
    /// Resume. v1 handled this renderer-side, via the `play` action handler.
    Play,
    /// Pause. v1 handled this renderer-side, via the `pause` action handler.
    Pause,
    /// v1's `'next'`.
    Next,
    /// v1's `'previous'`.
    Previous,
    /// v1's `'stop'`.
    Stop,
    /// Jump to an absolute position. v1's `seekto` action handler.
    SeekTo {
        /// Target position in seconds.
        #[specta(type = Number)]
        position: f64,
    },
    /// Move the playhead by a signed offset.
    SeekBy {
        /// Offset in seconds; negative seeks backward.
        #[specta(type = Number)]
        offset: f64,
    },
    /// Show the window. The tray's "Show Shiranami" raises the same command.
    Raise,
    /// Quit the app. The tray's "Quit" raises the same command.
    Quit,
}

impl MediaCommand {
    /// Route an OS event, or decline it.
    ///
    /// Two variants are declined. `SetVolume` is MPRIS-only by souvlaki's own
    /// documentation — it asks the caller to echo the value back with
    /// `set_volume`, a method neither the Windows nor the macOS backend has —
    /// and `OpenUri` has no shiranami meaning: the app plays its own library,
    /// not URIs handed to it by a desktop shell. Neither is reachable on the two
    /// platforms we ship; declining them is what "unreachable" looks like in
    /// code rather than in a comment.
    pub fn from_remote(event: RemoteEvent) -> Option<Self> {
        Some(match event {
            RemoteEvent::Play => Self::Play,
            RemoteEvent::Pause => Self::Pause,
            RemoteEvent::Toggle => Self::TogglePlay,
            RemoteEvent::Next => Self::Next,
            RemoteEvent::Previous => Self::Previous,
            RemoteEvent::Stop => Self::Stop,
            RemoteEvent::Seek(direction) => Self::SeekBy {
                offset: signed(direction, DEFAULT_SEEK_OFFSET_SECONDS),
            },
            RemoteEvent::SeekBy(direction, amount) => Self::SeekBy {
                offset: signed(direction, amount.as_secs_f64()),
            },
            RemoteEvent::SetPosition(position) => Self::SeekTo {
                position: position.as_secs_f64(),
            },
            RemoteEvent::Raise => Self::Raise,
            RemoteEvent::Quit => Self::Quit,
            RemoteEvent::SetVolume(_) | RemoteEvent::OpenUri(_) => return None,
        })
    }

    /// Whether this command is the renderer's to act on.
    ///
    /// [`Self::Raise`] and [`Self::Quit`] are the shell's — v1 handled the
    /// equivalent tray items in the main process and never told the renderer —
    /// so the shell forwards everything else and keeps these two.
    pub fn is_playback(&self) -> bool {
        !matches!(self, Self::Raise | Self::Quit)
    }
}

/// Apply a direction to a magnitude.
fn signed(direction: SeekDirection, seconds: f64) -> f64 {
    match direction {
        SeekDirection::Forward => seconds,
        SeekDirection::Backward => -seconds,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route(event: RemoteEvent) -> Option<MediaCommand> {
        MediaCommand::from_remote(event)
    }

    /// The four strings v1's `useMediaSession.ts` switch matches on. If this
    /// test fails the Phase 15 shim has to grow a translation table.
    #[test]
    fn v1s_four_commands_still_serialize_as_bare_strings() {
        for (command, expected) in [
            (MediaCommand::TogglePlay, "toggle-play"),
            (MediaCommand::Next, "next"),
            (MediaCommand::Previous, "previous"),
            (MediaCommand::Stop, "stop"),
        ] {
            let json = serde_json::to_value(&command).expect("MediaCommand serializes");
            assert_eq!(json, serde_json::Value::String(expected.to_owned()));
        }
    }

    #[test]
    fn the_play_pause_pair_maps_one_to_one() {
        assert_eq!(route(RemoteEvent::Play), Some(MediaCommand::Play));
        assert_eq!(route(RemoteEvent::Pause), Some(MediaCommand::Pause));
    }

    /// macOS' `togglePlayPauseCommand` — the one a laptop's F8 key hits — is
    /// the only thing souvlaki reports as `Toggle`, and v1's tray Play/Pause row
    /// sent the same `'toggle-play'`.
    #[test]
    fn toggle_becomes_v1s_toggle_play() {
        assert_eq!(route(RemoteEvent::Toggle), Some(MediaCommand::TogglePlay));
    }

    #[test]
    fn track_skips_map_one_to_one() {
        assert_eq!(route(RemoteEvent::Next), Some(MediaCommand::Next));
        assert_eq!(route(RemoteEvent::Previous), Some(MediaCommand::Previous));
        assert_eq!(route(RemoteEvent::Stop), Some(MediaCommand::Stop));
    }

    #[test]
    fn an_absolute_seek_carries_seconds() {
        assert_eq!(
            route(RemoteEvent::SetPosition(Duration::from_millis(90_500))),
            Some(MediaCommand::SeekTo { position: 90.5 })
        );
    }

    #[test]
    fn a_stated_relative_seek_keeps_its_magnitude_and_takes_a_sign() {
        assert_eq!(
            route(RemoteEvent::SeekBy(
                SeekDirection::Forward,
                Duration::from_secs(30)
            )),
            Some(MediaCommand::SeekBy { offset: 30.0 })
        );
        assert_eq!(
            route(RemoteEvent::SeekBy(
                SeekDirection::Backward,
                Duration::from_secs(30)
            )),
            Some(MediaCommand::SeekBy { offset: -30.0 })
        );
    }

    /// SMTC's Rewind/FastForward arrive with no magnitude, and souvlaki enables
    /// those buttons whether we want them or not.
    #[test]
    fn an_amountless_seek_uses_the_media_session_default_offset() {
        assert_eq!(
            route(RemoteEvent::Seek(SeekDirection::Forward)),
            Some(MediaCommand::SeekBy { offset: 10.0 })
        );
        assert_eq!(
            route(RemoteEvent::Seek(SeekDirection::Backward)),
            Some(MediaCommand::SeekBy { offset: -10.0 })
        );
        assert_eq!(DEFAULT_SEEK_OFFSET_SECONDS, 10.0);
    }

    #[test]
    fn window_and_lifecycle_events_route_to_the_shells_commands() {
        assert_eq!(route(RemoteEvent::Raise), Some(MediaCommand::Raise));
        assert_eq!(route(RemoteEvent::Quit), Some(MediaCommand::Quit));
    }

    #[test]
    fn mpris_only_events_are_declined_rather_than_guessed_at() {
        assert_eq!(route(RemoteEvent::SetVolume(0.4)), None);
        assert_eq!(
            route(RemoteEvent::OpenUri("file:///tmp/x.mp3".to_owned())),
            None
        );
    }

    #[test]
    fn only_raise_and_quit_stay_with_the_shell() {
        for command in [
            MediaCommand::TogglePlay,
            MediaCommand::Play,
            MediaCommand::Pause,
            MediaCommand::Next,
            MediaCommand::Previous,
            MediaCommand::Stop,
            MediaCommand::SeekTo { position: 1.0 },
            MediaCommand::SeekBy { offset: 1.0 },
        ] {
            assert!(command.is_playback(), "{command:?} is the renderer's");
        }

        assert!(!MediaCommand::Raise.is_playback());
        assert!(!MediaCommand::Quit.is_playback());
    }

    #[test]
    fn a_seek_round_trips_through_its_wire_form() {
        let command = MediaCommand::SeekTo { position: 42.25 };
        let json = serde_json::to_string(&command).expect("serializes");
        assert_eq!(json, r#"{"seek-to":{"position":42.25}}"#);

        let decoded: MediaCommand = serde_json::from_str(&json).expect("round trips");
        assert_eq!(decoded, command);
    }
}
