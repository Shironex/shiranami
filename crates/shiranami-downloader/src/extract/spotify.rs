//! Scraping a Spotify playlist out of its public embed page.
//!
//! The embed page is the **only** metadata source. Spotify's Web API now
//! requires the application owner to hold Premium, so v1 dropped it, and what
//! is left is a server-rendered Next.js page whose `__NEXT_DATA__` blob carries
//! the track list.
//!
//! # Three strategies, and why the ladder is shaped the way it is
//!
//! 1. **`__NEXT_DATA__` → `entity.trackList`.** The real structure.
//! 2. **A bracket-depth scan for any `"trackList"` array.** For the day the
//!    surrounding `props.pageProps.state.data` path moves.
//! 3. **A regex sweep of every script body for title/artists pairs.** Last
//!    resort.
//!
//! The ladder does not descend on *failure*, it descends on **failure to
//! produce a real artist** — a track with a title and a non-`Unknown` artist.
//! That is the fix for v1's original bug: the primary parse read
//! `artists[].name`, which the live embed does not have, so it "succeeded" with
//! a full list of `Unknown` artists and starved the fallback that would have
//! worked. The artist lives on `subtitle`.
//!
//! # Durations are milliseconds
//!
//! `duration` is in milliseconds and the matcher scores in seconds, so it is
//! divided and rounded here. Getting this wrong makes every duration score
//! collapse, which silently turns the matcher into a title-only search.

use serde_json::Value;

use crate::extract::spotify_fallback::{scan_track_lists, sweep_scripts};

/// A track as Spotify describes it.
///
/// `album` and `isrc` are always absent from the embed scrape; they exist
/// because the matcher scores them when present and the field list is the
/// matcher's input contract.
#[derive(Debug, Clone, PartialEq)]
pub struct SpotifyTrack {
    /// Track title.
    pub title: String,
    /// Artist, or `"Unknown"` when the page gave none.
    pub artist: String,
    /// Album name. Never present from the embed.
    pub album: Option<String>,
    /// Duration in **seconds**, converted from the embed's milliseconds.
    pub duration_sec: Option<f64>,
    /// Recording identifier. Never present from the embed.
    pub isrc: Option<String>,
}

/// What an absent artist is called, and the value the ladder tests against.
pub const UNKNOWN_ARTIST: &str = "Unknown";

/// Whether a parse produced something worth trusting.
pub fn is_real_track(track: &SpotifyTrack) -> bool {
    !track.title.is_empty() && track.artist != UNKNOWN_ARTIST
}

/// Coerce one embed track object into a [`SpotifyTrack`].
///
/// `raw.track ?? raw`: some shapes wrap the track, some are the track.
pub fn map_embed_track(raw: &Value) -> Option<SpotifyTrack> {
    let item = raw.get("track").unwrap_or(raw);

    let title = trimmed_string(item.get("title"))
        .or_else(|| trimmed_string(item.get("name")))
        .unwrap_or_default();
    if title.is_empty() {
        return None;
    }

    // `subtitle` first — this is the field the live embed actually populates,
    // and reading `artists[].name` first is the bug that made every artist
    // `Unknown`.
    let artist = trimmed_string(item.get("subtitle"))
        .or_else(|| artists_joined(item.get("artists")))
        .or_else(|| trimmed_string(item.get("artist")))
        .unwrap_or_default();

    let duration_sec = item
        .get("duration")
        .and_then(Value::as_f64)
        .filter(|milliseconds| *milliseconds > 0.0)
        .map(|milliseconds| (milliseconds / 1000.0).round());

    Some(SpotifyTrack {
        title,
        artist: if artist.is_empty() {
            UNKNOWN_ARTIST.to_owned()
        } else {
            artist
        },
        album: None,
        duration_sec,
        isrc: None,
    })
}

/// A string field, trimmed, or `None` when absent or blank.
fn trimmed_string(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str()?.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// `artists.map(a => a.name).filter(Boolean).join(', ')`.
fn artists_joined(value: Option<&Value>) -> Option<String> {
    let names: Vec<String> = value?
        .as_array()?
        .iter()
        .filter_map(|artist| trimmed_string(artist.get("name")))
        .collect();

    (!names.is_empty()).then(|| names.join(", "))
}

/// Parse the embed page's track list.
///
/// Returns whatever the first strategy that produced a *real* track found; if
/// none did, the primary or bracket-scan result is returned anyway (possibly
/// empty), because a list of `Unknown`-artist tracks is still more than
/// nothing for the matcher to work with.
pub fn parse_embed_html(html: &str) -> Vec<SpotifyTrack> {
    if let Some(tracks) = parse_next_data(html)
        && tracks.iter().any(is_real_track)
    {
        return tracks;
    }

    let scanned = scan_track_lists(html);
    if scanned.iter().any(is_real_track) {
        return scanned;
    }

    let swept = sweep_scripts(html);
    if swept.iter().any(is_real_track) {
        return swept;
    }

    // Neither fallback found a real artist. The bracket scan is preferred
    // because it at least parsed structured data.
    if scanned.is_empty() { swept } else { scanned }
}

/// The playlist's own name, from `entity.name` or `entity.title`.
pub fn parse_playlist_name(html: &str) -> Option<String> {
    let entity = next_data_entity(html)?;

    trimmed_string(entity.get("name")).or_else(|| trimmed_string(entity.get("title")))
}

/// Strategy 1: `props.pageProps.state.data.entity.trackList`.
fn parse_next_data(html: &str) -> Option<Vec<SpotifyTrack>> {
    let entity = next_data_entity(html)?;

    let items = entity
        .get("trackList")
        .or_else(|| entity.get("tracks").and_then(|tracks| tracks.get("items")))?
        .as_array()?;

    Some(
        items
            .iter()
            .filter(|item| item.is_object())
            .filter_map(map_embed_track)
            .collect(),
    )
}

/// The `entity` object out of the `__NEXT_DATA__` script tag.
fn next_data_entity(html: &str) -> Option<Value> {
    let blob = crate::extract::spotify_fallback::next_data_blob(html)?;
    let parsed: Value = serde_json::from_str(blob)
        .inspect_err(|_| {
            tracing::warn!("could not parse __NEXT_DATA__ from the Spotify embed page");
        })
        .ok()?;

    parsed
        .get("props")?
        .get("pageProps")?
        .get("state")?
        .get("data")?
        .get("entity")
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_artist_comes_from_subtitle_not_from_the_artists_array() {
        let track = map_embed_track(&json!({
            "title": "Janice STFU",
            "subtitle": "Drake",
            "artists": [{ "name": "Someone Else" }],
            "duration": 237_344,
        }))
        .expect("the track maps");

        assert_eq!(
            track.artist, "Drake",
            "reading `artists[].name` first is the bug that made every artist \
             `Unknown` on the live embed"
        );
    }

    #[test]
    fn the_artists_array_is_the_second_choice_and_joins_with_a_comma() {
        let track = map_embed_track(&json!({
            "title": "Collab",
            "artists": [{ "name": " A " }, { "name": "B" }, { "nope": 1 }],
        }))
        .expect("the track maps");

        assert_eq!(track.artist, "A, B");
    }

    #[test]
    fn a_bare_artist_string_is_the_third_choice() {
        let track =
            map_embed_track(&json!({ "title": "Solo", "artist": "C" })).expect("the track maps");

        assert_eq!(track.artist, "C");
    }

    #[test]
    fn an_artistless_track_is_named_unknown() {
        let track = map_embed_track(&json!({ "title": "Nameless" })).expect("the track maps");

        assert_eq!(track.artist, UNKNOWN_ARTIST);
        assert!(!is_real_track(&track));
    }

    #[test]
    fn a_titleless_track_does_not_map_at_all() {
        assert!(map_embed_track(&json!({ "subtitle": "Drake" })).is_none());
        assert!(map_embed_track(&json!({ "title": "   " })).is_none());
    }

    #[test]
    fn a_wrapped_track_is_unwrapped_first() {
        let track = map_embed_track(&json!({
            "track": { "title": "Wrapped", "subtitle": "Artist" }
        }))
        .expect("the track maps");

        assert_eq!(track.title, "Wrapped");
        assert_eq!(track.artist, "Artist");
    }

    #[test]
    fn the_name_field_stands_in_for_title() {
        let track = map_embed_track(&json!({ "name": "By Name", "subtitle": "Artist" }))
            .expect("the track maps");

        assert_eq!(track.title, "By Name");
    }

    #[test]
    fn duration_converts_from_milliseconds_to_rounded_seconds() {
        for (milliseconds, seconds) in [(237_344, 237.0), (97_960, 98.0), (176_453, 176.0)] {
            let track = map_embed_track(&json!({
                "title": "T", "subtitle": "A", "duration": milliseconds
            }))
            .expect("the track maps");

            assert_eq!(track.duration_sec, Some(seconds));
        }
    }

    #[test]
    fn a_zero_or_absent_duration_is_no_duration() {
        for value in [json!(0), json!(-1), Value::Null] {
            let track = map_embed_track(&json!({
                "title": "T", "subtitle": "A", "duration": value
            }))
            .expect("the track maps");

            assert_eq!(
                track.duration_sec, None,
                "the matcher scores an unknown duration neutrally; a zero \
                 would score it as a total mismatch"
            );
        }
    }
}
