//! What the renderer says is playing.
//!
//! [`NowPlaying`] is a field-for-field port of v1's `MediaPlaybackState`
//! (`packages/contracts/src/ipc/preload-api.ts`), which the renderer pushed over
//! the `media:playback-state` channel. In v2 the same seven fields arrive as the
//! argument of a single command, because §2.7 collapses `useMediaSession.ts` and
//! `components/player/MediaSessionSync/` into an `invoke('media_controls_update', …)`
//! shim. Keeping the shape identical is what makes that shim thin.
//!
//! v1 expressed "nothing is playing" as a second channel (`media:clear-state`),
//! and the renderer separately set `navigator.mediaSession.metadata = null` and
//! `playbackState = 'none'`. [`MediaState`] is the single value that stands for
//! both branches, so every consumer in this crate handles the cleared case by
//! matching rather than by remembering to null-check.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// The playing track, as the renderer sees it.
///
/// Every field is display-shaped already: `title`, `artist` and `album` have
/// been collapsed to non-null strings upstream (v1 did the same, via
/// `UNKNOWN_ARTIST` / `UNKNOWN_ALBUM`), and `duration`/`current_time` are
/// seconds as `number` — the units the HTML media element reports.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    /// Whether the renderer's audio element is currently playing.
    pub is_playing: bool,
    /// Display title.
    pub title: String,
    /// Display artist.
    pub artist: String,
    /// Display album.
    pub album: String,
    /// Track length in seconds. May be `0`, `NaN` or infinite before the
    /// element has loaded metadata, which is why nothing downstream trusts it
    /// without [`crate::os`]'s finiteness check.
    #[specta(type = Number)]
    pub duration: f64,
    /// Playhead position in seconds.
    #[specta(type = Number)]
    pub current_time: f64,
    /// Cover URL, or `None` when the track carries no art.
    pub album_art: Option<String>,
}

impl NowPlaying {
    /// Whether `other` describes the same *item*, ignoring the playhead.
    ///
    /// This is the structural-change test §2.2 asks high-frequency emitters for
    /// ("throttle + coalescing … immediate on structural change"): a track
    /// change must reach the OS at once, while a playhead tick may wait for the
    /// throttle window. `duration` counts as identity because a change in it
    /// means the element loaded a different stream, and `is_playing` counts
    /// because a play/pause the user just performed is the update they are
    /// watching for.
    pub fn is_same_item(&self, other: &Self) -> bool {
        self.title == other.title
            && self.artist == other.artist
            && self.album == other.album
            && self.album_art == other.album_art
            && self.is_playing == other.is_playing
            && bits_equal(self.duration, other.duration)
    }
}

/// `f64` equality that treats two `NaN`s as the same value.
///
/// A duration of `NaN` is a real state — an audio element reports it until
/// metadata loads — and `NaN != NaN` would classify every tick during that
/// window as a structural change, defeating the throttle precisely when the
/// renderer is emitting fastest.
fn bits_equal(left: f64, right: f64) -> bool {
    left == right || (left.is_nan() && right.is_nan())
}

/// What the OS surfaces should be showing.
///
/// The `Cleared` variant is v1's `clearState()` and its
/// `playbackState = 'none'` rolled together.
#[derive(Debug, Clone, Default, PartialEq)]
pub enum MediaState {
    /// No track is loaded.
    #[default]
    Cleared,
    /// A track is loaded, playing or paused.
    Loaded(NowPlaying),
}

impl MediaState {
    /// The track, when there is one.
    pub fn track(&self) -> Option<&NowPlaying> {
        match self {
            Self::Cleared => None,
            Self::Loaded(track) => Some(track),
        }
    }

    /// Whether moving from `self` to `next` is a structural change.
    ///
    /// Clearing, loading, changing track and toggling play/pause all are;
    /// advancing the playhead alone is not. See [`NowPlaying::is_same_item`].
    pub fn is_structural_change(&self, next: &Self) -> bool {
        match (self, next) {
            (Self::Cleared, Self::Cleared) => false,
            (Self::Loaded(current), Self::Loaded(next)) => !current.is_same_item(next),
            _ => true,
        }
    }
}

impl From<NowPlaying> for MediaState {
    fn from(track: NowPlaying) -> Self {
        Self::Loaded(track)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::{playing, track};

    #[test]
    fn the_wire_shape_is_v1s_media_playback_state() {
        let json = serde_json::to_value(track()).expect("NowPlaying serializes");
        let object = json.as_object().expect("serializes as an object");

        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "album",
                "albumArt",
                "artist",
                "currentTime",
                "duration",
                "isPlaying",
                "title"
            ],
            "v1's MediaPlaybackState had exactly these seven camelCase keys"
        );
    }

    #[test]
    fn a_missing_cover_stays_null_rather_than_disappearing() {
        let mut without_art = track();
        without_art.album_art = None;
        let json = serde_json::to_value(without_art).expect("NowPlaying serializes");
        assert_eq!(
            json.get("albumArt"),
            Some(&serde_json::Value::Null),
            "v1 typed it `string | null`, so the key is always present"
        );
    }

    #[test]
    fn advancing_the_playhead_is_not_structural() {
        let before = MediaState::Loaded(playing(10.0));
        let after = MediaState::Loaded(playing(10.25));
        assert!(!before.is_structural_change(&after));
    }

    #[test]
    fn changing_track_is_structural() {
        let before = MediaState::Loaded(playing(10.0));
        let mut other = playing(0.0);
        other.title = "Another Song".to_owned();
        assert!(before.is_structural_change(&MediaState::Loaded(other)));
    }

    #[test]
    fn toggling_play_is_structural() {
        let before = MediaState::Loaded(playing(10.0));
        let mut paused = playing(10.0);
        paused.is_playing = false;
        assert!(
            before.is_structural_change(&MediaState::Loaded(paused)),
            "the user pressed pause and is watching the OS surface for it"
        );
    }

    #[test]
    fn changing_the_cover_is_structural() {
        let before = MediaState::Loaded(playing(10.0));
        let mut recovered = playing(10.0);
        recovered.album_art = Some("http://127.0.0.1:9/t/art/beef.jpg".to_owned());
        assert!(before.is_structural_change(&MediaState::Loaded(recovered)));
    }

    #[test]
    fn clearing_and_loading_are_both_structural() {
        let loaded = MediaState::Loaded(playing(10.0));
        assert!(loaded.is_structural_change(&MediaState::Cleared));
        assert!(MediaState::Cleared.is_structural_change(&loaded));
        assert!(!MediaState::Cleared.is_structural_change(&MediaState::Cleared));
    }

    /// Before `loadedmetadata` the element reports `NaN`, every 250 ms. Without
    /// the `NaN`-aware comparison each of those ticks would look structural.
    #[test]
    fn an_unloaded_duration_does_not_look_like_a_new_track_every_tick() {
        let mut first = playing(0.0);
        first.duration = f64::NAN;
        let mut second = first.clone();
        second.current_time = 0.25;

        assert!(!MediaState::Loaded(first).is_structural_change(&MediaState::Loaded(second)));
    }

    #[test]
    fn the_cleared_state_carries_no_track() {
        assert!(MediaState::default().track().is_none());
        assert!(MediaState::Loaded(playing(1.0)).track().is_some());
    }
}
