//! Listening history, ported from `packages/contracts/src/ipc/history.ts`.
//!
//! The one model file whose source is `contracts/src/ipc/` rather than
//! `contracts/src/domain/`. v1 put these shapes next to the channel constants
//! instead of in the domain folder, which is why Phase 2 — which ported
//! `domain/` — did not bring them across. They are ordinary wire types with
//! renderer consumers, so they belong here with the rest.
//!
//! **Nullability is not uniform across these types, and that is deliberate.**
//! `tracks.artist` and `tracks.album` are nullable columns, but every read shape
//! below declares them as plain `String`: the history repository collapses a
//! `NULL` onto [`crate::constants::UNKNOWN_ARTIST`] /
//! [`crate::constants::UNKNOWN_ALBUM`] on the way out, exactly as v1's handlers
//! did, so the renderer can render the field directly and never shows a literal
//! "null". `album_art` and `duration` stay nullable because there is no sensible
//! sentinel for a missing cover or an unknown length.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Renderer → main payload for recording one finished play.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecordPlayInput {
    /// The track that was played.
    pub track_id: String,
    /// How many seconds of it were actually heard.
    #[specta(type = Number)]
    pub played_seconds: f64,
    /// Track length in seconds, or `null` when unknown (a radio stream).
    ///
    /// Nullable rather than optional: the renderer always sends the key, and
    /// the completion math below branches on the value being present.
    #[specta(type = Option<Number>)]
    pub duration: Option<f64>,
    /// Playback origin — `"library"` or `"radio"`. Absent means `"library"`.
    #[specta(optional)]
    pub source: Option<String>,
}

/// The raw `play_history` row echoed back after the insert.
///
/// Deliberately distinct from [`ListeningHistoryEntry`], which is the
/// track-joined read shape the history views render. This one carries no track
/// metadata at all — the caller that just recorded the play already has it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayHistoryRecord {
    /// Primary key (UUID v4), minted by the caller.
    pub id: String,
    /// The track that was played.
    pub track_id: String,
    /// ISO-8601 timestamp, as v1 wrote it (`new Date().toISOString()`).
    pub played_at: String,
    /// Seconds heard, clamped to zero.
    #[specta(type = Number)]
    pub played_seconds: f64,
    /// Fraction of the track heard, in `0.0..=1.0`. Zero when the length was
    /// unknown.
    #[specta(type = Number)]
    pub completion_ratio: f64,
    /// Whether the play counted as complete (≥ 95% of a known length).
    pub completed: bool,
    /// Playback origin.
    pub source: String,
}

/// One row of the history list: a play joined to the track it played.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningHistoryEntry {
    /// `play_history` primary key.
    pub id: String,
    /// The track that was played.
    pub track_id: String,
    /// Track title.
    pub title: String,
    /// Track artist, or the unknown-artist sentinel.
    pub artist: String,
    /// Track album, or the unknown-album sentinel.
    pub album: String,
    /// Cached cover path, when the track has one.
    pub album_art: Option<String>,
    /// Track length in seconds, when known.
    #[specta(type = Option<Number>)]
    pub duration: Option<f64>,
    /// ISO-8601 timestamp of the play.
    pub played_at: String,
    /// Seconds heard.
    #[specta(type = Number)]
    pub played_seconds: f64,
    /// Fraction of the track heard.
    #[specta(type = Number)]
    pub completion_ratio: f64,
    /// Whether the play counted as complete.
    pub completed: bool,
    /// Playback origin.
    pub source: String,
}

/// A track in the "most played" leaderboard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningStatsTrack {
    /// The track.
    pub track_id: String,
    /// Track title.
    pub title: String,
    /// Track artist, or the unknown-artist sentinel.
    pub artist: String,
    /// Track album, or the unknown-album sentinel.
    pub album: String,
    /// Cached cover path, when the track has one.
    pub album_art: Option<String>,
    /// Plays within the requested window — **not** `tracks.play_count`, which
    /// is a lifetime counter.
    pub play_count: u32,
    /// Total seconds heard within the window.
    #[specta(type = Number)]
    pub listened_seconds: f64,
    /// ISO-8601 timestamp of the most recent play in the window.
    pub last_played_at: String,
}

/// An artist in the "most played" leaderboard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningStatsArtist {
    /// Artist name, or the unknown-artist sentinel.
    pub artist: String,
    /// Plays within the requested window.
    pub play_count: u32,
    /// Total seconds heard within the window.
    #[specta(type = Number)]
    pub listened_seconds: f64,
}

/// Aggregate totals plus the two leaderboards, for one window.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningStatsSummary {
    /// Plays in the window.
    pub total_plays: u32,
    /// Minutes heard in the window.
    #[specta(type = Number)]
    pub total_minutes: f64,
    /// Distinct tracks played.
    pub unique_tracks: u32,
    /// Distinct artists played. `NULL` artists are not counted — SQL
    /// `COUNT(DISTINCT …)` skips them, and v1 relied on that.
    pub unique_artists: u32,
    /// Plays that reached the completion threshold.
    pub completed_plays: u32,
    /// The five most played tracks.
    pub top_tracks: Vec<ListeningStatsTrack>,
    /// The five most played artists.
    pub top_artists: Vec<ListeningStatsArtist>,
}

/// One day in the activity chart.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningActivityPoint {
    /// `YYYY-MM-DD`, sliced from the stored timestamp (so, UTC).
    pub date: String,
    /// Plays on that day.
    pub play_count: u32,
    /// Minutes heard on that day.
    #[specta(type = Number)]
    pub listened_minutes: f64,
}

/// One cell of the day-of-week × hour heatmap.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningHourlyActivityPoint {
    /// Day of week, SQLite-indexed: `0` = Sunday … `6` = Saturday, in **local**
    /// time. The renderer remaps to a Monday-first grid.
    pub day_of_week: u32,
    /// Hour of day in local time, `0..=23`.
    pub hour: u32,
    /// Plays in that cell.
    pub play_count: u32,
    /// Minutes heard in that cell.
    #[specta(type = Number)]
    pub listened_minutes: f64,
}

/// An album in the weekly-insights leaderboard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningAlbumStat {
    /// Album title. Never empty — blank albums are filtered out of the query.
    pub album: String,
    /// Album artist when tagged, else a representative track artist, else the
    /// unknown-artist sentinel.
    pub artist: String,
    /// Cached cover path, when any track in the group has one.
    pub album_art: Option<String>,
    /// Plays within the window.
    pub play_count: u32,
}

/// The weekly-insights card: how many listening sessions, and the top albums.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyInsights {
    /// Gap-based session count — more than 30 minutes idle starts a new one.
    pub session_count: u32,
    /// The five most played albums.
    pub top_albums: Vec<ListeningAlbumStat>,
}
