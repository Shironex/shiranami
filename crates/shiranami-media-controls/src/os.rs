//! The renderer's playback state, as the OS wants to hear it.
//!
//! These two types mirror `souvlaki::MediaMetadata` and
//! `souvlaki::MediaPlayback` exactly, and exist so the mapping — which is where
//! all the ported decisions live — is a pure function testable on a machine with
//! no media session at all. [`crate::souvlaki_backend`] converts them at the
//! last possible moment.
//!
//! # What v1 did, and what changed
//!
//! v1 built a `MediaMetadata` for `navigator.mediaSession` with an `artwork`
//! array of `{ src, sizes: '512x512' }` entries, and separately called
//! `setPositionState({ duration, position, playbackRate: 1 })`. The OS APIs
//! underneath take a *single* cover URL and fold position into the playback
//! status, so the artwork array collapses to [`OsMetadata::cover_url`] and the
//! position rides on [`OsPlayback`]. The guards survive the collapse verbatim:
//! v1 skipped `setPositionState` entirely unless `duration` was truthy and
//! finite, and clamped `position` to `Math.min(currentTime, duration)`.

use std::time::Duration;

use crate::state::{MediaState, NowPlaying};

/// A cover URL the OS can actually load.
///
/// Both shipped backends resolve the string themselves —
/// `RandomAccessStreamReference::CreateFromUri` on Windows (with a `file://`
/// special case that reads the path off disk) and `NSURL URLWithString:` on
/// macOS — so the scheme has to be one they understand.
const LOADABLE_COVER_SCHEMES: [&str; 3] = ["http://", "https://", "file://"];

/// Metadata for the OS now-playing surface.
///
/// The three text fields are `String`, not `Option<String>`, and are empty
/// rather than absent when there is nothing to show. That is deliberate:
/// souvlaki's Windows backend writes a field only when it is `Some`, so a
/// `None` leaves the *previous* track's title on the SMTC flyout forever. An
/// empty string overwrites it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OsMetadata {
    /// Display title, empty when cleared.
    pub title: String,
    /// Display artist, empty when cleared.
    pub artist: String,
    /// Display album, empty when cleared.
    pub album: String,
    /// Cover URL, when the renderer supplied one the OS can load.
    pub cover_url: Option<String>,
    /// Track length, when it is known.
    pub duration: Option<Duration>,
}

/// Playback status for the OS now-playing surface.
///
/// `Stopped` is v1's `playbackState = 'none'`; it carries no progress because
/// neither OS shows a scrubber for a stopped item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OsPlayback {
    /// Nothing is loaded.
    Stopped,
    /// Loaded and paused.
    Paused {
        /// Playhead, when it is meaningful.
        progress: Option<Duration>,
    },
    /// Loaded and playing.
    Playing {
        /// Playhead, when it is meaningful.
        progress: Option<Duration>,
    },
}

impl OsMetadata {
    /// Map a playback state onto the OS metadata fields.
    pub fn from_state(state: &MediaState) -> Self {
        match state.track() {
            None => Self::default(),
            Some(track) => Self {
                title: track.title.clone(),
                artist: track.artist.clone(),
                album: track.album.clone(),
                cover_url: cover_url(track.album_art.as_deref()),
                duration: known_duration(track.duration),
            },
        }
    }
}

impl OsPlayback {
    /// Map a playback state onto the OS playback status.
    pub fn from_state(state: &MediaState) -> Self {
        match state.track() {
            None => Self::Stopped,
            Some(track) => {
                let progress = progress(track);
                if track.is_playing {
                    Self::Playing { progress }
                } else {
                    Self::Paused { progress }
                }
            }
        }
    }

    /// The playhead this status carries, if any.
    pub fn progress(&self) -> Option<Duration> {
        match self {
            Self::Stopped => None,
            Self::Paused { progress } | Self::Playing { progress } => *progress,
        }
    }
}

/// A duration the OS can use, or `None`.
///
/// v1's guard was `if (!duration || !isFinite(duration)) return;`, which
/// rejects `0`, `NaN` and `±Infinity`. It let a *negative* duration through,
/// which here would reach `Duration::from_secs_f64` and panic, so the
/// comparison is `> 0.0` rather than `!= 0.0` — a strictly narrower gate that
/// admits nothing v1 admitted and could act on.
fn known_duration(seconds: f64) -> Option<Duration> {
    (seconds.is_finite() && seconds > 0.0).then(|| Duration::from_secs_f64(seconds))
}

/// The playhead, clamped into the track the way v1 clamped it.
///
/// Returns `None` whenever the duration is unknown, mirroring v1 skipping
/// `setPositionState` outright in that case: a position without a length makes
/// a scrubber that cannot be reasoned about.
fn progress(track: &NowPlaying) -> Option<Duration> {
    let duration = known_duration(track.duration)?;
    let seconds = track.current_time;

    if !seconds.is_finite() || seconds <= 0.0 {
        return Some(Duration::ZERO);
    }

    Some(Duration::from_secs_f64(seconds).min(duration))
}

/// A cover URL both backends can resolve, or `None`.
///
/// v1 accepted `http`, `data:` and `blob:` directly and `fetch`-ed anything else
/// (in practice the `shiranami-art://` custom scheme) into an object URL,
/// because `MediaImage.src` had to be a web URL. §2.4 deletes the custom scheme
/// — art is served from the loopback server as `http://127.0.0.1:<port>/…` — so
/// the fetch-and-revoke dance has nothing left to convert and is dropped.
///
/// `data:` and `blob:` are rejected rather than forwarded: a blob URL belongs to
/// a webview that the OS process cannot read, and neither
/// `CreateFromUri` nor `NSURL` will load a data URI of cover-art size.
fn cover_url(album_art: Option<&str>) -> Option<String> {
    let candidate = album_art?.trim();

    if candidate.is_empty() {
        return None;
    }

    LOADABLE_COVER_SCHEMES
        .iter()
        .any(|scheme| candidate.len() > scheme.len() && candidate.starts_with(scheme))
        .then(|| candidate.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::{playing, track};

    fn loaded(track: NowPlaying) -> MediaState {
        MediaState::Loaded(track)
    }

    #[test]
    fn a_loaded_track_maps_field_for_field() {
        let metadata = OsMetadata::from_state(&loaded(track()));

        assert_eq!(metadata.title, "Sakura Nights");
        assert_eq!(metadata.artist, "Yumemi");
        assert_eq!(metadata.album, "Hazy Tapes");
        assert_eq!(metadata.duration, Some(Duration::from_secs_f64(214.0)));
        assert_eq!(
            metadata.cover_url.as_deref(),
            Some("http://127.0.0.1:52341/tok/art/abcdef.jpg")
        );
    }

    /// The reason the text fields are not `Option`: souvlaki's Windows backend
    /// skips a `None`, so anything but an empty string leaves the last track on
    /// the flyout after the user stops playback.
    #[test]
    fn clearing_blanks_every_text_field_rather_than_omitting_it() {
        let metadata = OsMetadata::from_state(&MediaState::Cleared);

        assert_eq!(metadata.title, "");
        assert_eq!(metadata.artist, "");
        assert_eq!(metadata.album, "");
        assert_eq!(metadata.cover_url, None);
        assert_eq!(metadata.duration, None);
    }

    #[test]
    fn clearing_stops_playback() {
        assert_eq!(
            OsPlayback::from_state(&MediaState::Cleared),
            OsPlayback::Stopped
        );
    }

    #[test]
    fn playing_and_paused_carry_the_playhead() {
        assert_eq!(
            OsPlayback::from_state(&loaded(playing(30.5))),
            OsPlayback::Playing {
                progress: Some(Duration::from_secs_f64(30.5))
            }
        );

        let mut paused = playing(30.5);
        paused.is_playing = false;
        assert_eq!(
            OsPlayback::from_state(&loaded(paused)),
            OsPlayback::Paused {
                progress: Some(Duration::from_secs_f64(30.5))
            }
        );
    }

    /// v1: `position: Math.min(currentTime, duration)`.
    #[test]
    fn a_playhead_past_the_end_is_clamped_to_the_end() {
        let progress = OsPlayback::from_state(&loaded(playing(9_999.0))).progress();
        assert_eq!(progress, Some(Duration::from_secs_f64(214.0)));
    }

    #[test]
    fn a_negative_or_nan_playhead_becomes_zero() {
        for value in [-4.0, f64::NAN, f64::NEG_INFINITY] {
            assert_eq!(
                OsPlayback::from_state(&loaded(playing(value))).progress(),
                Some(Duration::ZERO),
                "a {value} playhead must not reach Duration::from_secs_f64"
            );
        }
    }

    /// v1's `if (!duration || !isFinite(duration)) return;` — the same four
    /// values, and the negative one v1 would have passed through.
    #[test]
    fn an_unusable_duration_is_unknown_and_suppresses_the_playhead() {
        for value in [0.0, f64::NAN, f64::INFINITY, -1.0] {
            let mut unusable = playing(12.0);
            unusable.duration = value;

            let metadata = OsMetadata::from_state(&loaded(unusable.clone()));
            assert_eq!(metadata.duration, None, "duration {value} is not usable");

            assert_eq!(
                OsPlayback::from_state(&loaded(unusable)).progress(),
                None,
                "v1 skipped setPositionState outright for duration {value}"
            );
        }
    }

    #[test]
    fn loadable_cover_schemes_pass_through_untouched() {
        for url in [
            "http://127.0.0.1:52341/tok/art/abcdef.jpg",
            "https://cdn.example.test/cover.png",
            "file:///Users/me/Music/cover.jpg",
        ] {
            let mut with_art = playing(0.0);
            with_art.album_art = Some(url.to_owned());
            assert_eq!(
                OsMetadata::from_state(&loaded(with_art))
                    .cover_url
                    .as_deref(),
                Some(url)
            );
        }
    }

    /// A blob URL is scoped to the webview and a data URI is not something
    /// either OS surface will fetch, so both become "no cover" rather than a
    /// broken one.
    #[test]
    fn webview_only_cover_urls_are_dropped() {
        for url in [
            "blob:http://localhost/8b1c-4f",
            "data:image/png;base64,iVBORw0K",
            "shiranami-art://art/abcdef.jpg",
            "/Users/me/Music/cover.jpg",
            "",
            "   ",
            "http://",
        ] {
            let mut with_art = playing(0.0);
            with_art.album_art = Some(url.to_owned());
            assert_eq!(
                OsMetadata::from_state(&loaded(with_art)).cover_url,
                None,
                "{url} is not loadable by SMTC or MPMediaItemArtwork"
            );
        }
    }

    #[test]
    fn an_absent_cover_is_absent() {
        let mut without_art = playing(0.0);
        without_art.album_art = None;
        assert_eq!(OsMetadata::from_state(&loaded(without_art)).cover_url, None);
    }

    #[test]
    fn a_stopped_status_carries_no_playhead() {
        assert_eq!(OsPlayback::Stopped.progress(), None);
    }
}
