//! Test doubles shared by the unit suites in this crate.
//!
//! The OS-facing half of this crate cannot be exercised in CI — SMTC needs a
//! real window and `MPNowPlayingInfoCenter` needs a real app bundle — so the
//! boundary is drawn at [`crate::backend::MediaControlsBackend`] and everything
//! above it is tested against [`RecordingBackend`]. That is the whole point of
//! the trait: the mapping, the routing and the coalescing are the parts with
//! decisions in them, and none of them should need a desktop to verify.

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
