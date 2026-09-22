//! Cross-process media payloads, ported from
//! `packages/contracts/src/domain/media.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Parsed audio-file metadata produced by the metadata service and the scan
/// pipeline.
///
/// Display-shaped: `artist`, `album` and `genre` are already collapsed to
/// non-null strings at parse time ([`crate::constants::UNKNOWN_ARTIST`],
/// [`crate::constants::UNKNOWN_ALBUM`], `""`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    /// Display title.
    pub title: String,
    /// Display artist.
    pub artist: String,
    /// Album-artist tag, used for album grouping. `None` when the tag is absent
    /// — it deliberately never falls back to `artist`.
    pub album_artist: Option<String>,
    /// Display album.
    pub album: String,
    /// Duration in seconds.
    #[specta(type = Number)]
    pub duration: f64,
    /// Genre tag; empty string when absent.
    pub genre: String,
    /// Release year.
    pub year: Option<i32>,
    /// Position within the album.
    pub track_number: Option<i32>,
    /// Disc number for multi-disc releases.
    pub disc_number: Option<i32>,
    /// Cover URL, or `None` when the file carries no embedded cover.
    pub album_art: Option<String>,
}

/// How confident the Spotify→YouTube matcher is in a candidate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MatchFlag {
    /// The best candidate scored below the confidence threshold.
    Low,
    /// The best candidate cleared the threshold.
    Ok,
}

/// A single yt-dlp search or extraction result.
///
/// Two fields keep yt-dlp's own snake_case on the wire (`webpage_url`,
/// `view_count`) because that is what v1 forwarded verbatim from yt-dlp's JSON;
/// the renderer reads those exact keys today. The Spotify-only scoring fields
/// beside them are camelCase because v1 added them itself. Preserving the
/// mixture is the point — it is not an inconsistency to tidy up.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// yt-dlp's video id.
    pub id: String,
    /// Video title.
    pub title: String,
    /// Channel name.
    pub uploader: String,
    /// Duration in seconds.
    #[specta(type = Number)]
    pub duration: f64,
    /// Thumbnail URL.
    pub thumbnail: String,
    /// Stream URL.
    pub url: String,
    /// Canonical watch-page URL. Keeps yt-dlp's snake_case key.
    #[serde(rename = "webpage_url")]
    pub webpage_url: String,
    /// View count. Keeps yt-dlp's snake_case key, and is absent from
    /// flat-playlist extraction. Held as `i64` because popular videos exceed
    /// `u32`.
    #[serde(rename = "view_count")]
    #[specta(optional, type = Option<Number>)]
    pub view_count: Option<i64>,
    /// 0..1 match score from the Spotify scorer; absent outside playlist import.
    #[specta(optional)]
    pub match_confidence: Option<f64>,
    /// Confidence bucket for the score above.
    #[specta(optional)]
    pub match_flag: Option<MatchFlag>,
}

/// Result of `playlist:extract`.
///
/// Carries the resolved tracks plus the source playlist's title, so the renderer
/// can offer to recreate a real playlist preserving the source name and order.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistExtractResult {
    /// Source playlist name; `None` when the provider surfaced none.
    pub title: Option<String>,
    /// The resolved tracks, in source order.
    pub tracks: Vec<SearchResult>,
}

/// Progress streamed while resolving an external playlist's tracks.
///
/// The payload of `playlist:extract-progress`. Only the Spotify path emits it —
/// YouTube extraction is one `yt-dlp --flat-playlist` call with nothing to
/// report partway through — and it fires **twice per track**, once before that
/// track's YouTube search and once after, which is what makes the counter move
/// while a slow search is in flight rather than jumping on completion.
///
/// `current` is clamped to `total` by the emitter: the pre-search tick reports
/// `completed + 1`, and with four workers in flight the last three would
/// otherwise report a number larger than the total.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistExtractProgress {
    /// How many tracks have been reached, 1-based and clamped to `total`.
    pub current: u32,
    /// How many tracks the source playlist holds.
    pub total: u32,
    /// `"{artist} - {title}"`, the row the renderer shows as in progress.
    pub track_name: String,
}
