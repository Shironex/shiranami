//! Row decoding, and where nullable columns meet non-null wire fields.
//!
//! These structs exist because the wire models live in `shiranami-core`, which
//! does not (and should not) depend on sqlx. Each one decodes a query and
//! converts. The conversions are the only place the unknown-artist and
//! unknown-album sentinels are applied — after grouping, never inside it (see
//! [`super`]).

use shiranami_core::constants::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_core::models::{
    ListeningActivityPoint, ListeningAlbumStat, ListeningHistoryEntry,
    ListeningHourlyActivityPoint, ListeningStatsArtist, ListeningStatsTrack, PlayHistoryRecord,
};

use super::record::PlayedTrackTags;

/// Narrow a SQL count to the wire type's `u32`.
///
/// Saturating rather than fallible: a count cannot be negative and cannot
/// plausibly exceed `u32::MAX`, and a play-count card is not worth an error
/// path that can only fire on a database no filesystem could hold.
pub(super) fn count(value: i64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// Collapse a nullable artist onto the sentinel the renderer displays.
fn artist_or_unknown(artist: Option<String>) -> String {
    artist.unwrap_or_else(|| UNKNOWN_ARTIST.to_owned())
}

/// Collapse a nullable album onto the sentinel the renderer displays.
fn album_or_unknown(album: Option<String>) -> String {
    album.unwrap_or_else(|| UNKNOWN_ALBUM.to_owned())
}

#[derive(sqlx::FromRow)]
pub(super) struct PlayHistoryRow {
    id: String,
    track_id: String,
    played_at: String,
    played_seconds: f64,
    completion_ratio: f64,
    completed: bool,
    source: String,
}

impl From<PlayHistoryRow> for PlayHistoryRecord {
    fn from(row: PlayHistoryRow) -> Self {
        Self {
            id: row.id,
            track_id: row.track_id,
            played_at: row.played_at,
            played_seconds: row.played_seconds,
            completion_ratio: row.completion_ratio,
            completed: row.completed,
            source: row.source,
        }
    }
}

#[derive(sqlx::FromRow)]
pub(super) struct PlayedTrackTagsRow {
    title: String,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
}

impl From<PlayedTrackTagsRow> for PlayedTrackTags {
    fn from(row: PlayedTrackTagsRow) -> Self {
        Self {
            title: row.title,
            artist: row.artist,
            album: row.album,
            duration: row.duration,
        }
    }
}

#[derive(sqlx::FromRow)]
pub(super) struct RecentRow {
    id: String,
    track_id: String,
    played_at: String,
    played_seconds: f64,
    completion_ratio: f64,
    completed: bool,
    source: String,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    album_art: Option<String>,
    duration: Option<f64>,
}

impl From<RecentRow> for ListeningHistoryEntry {
    fn from(row: RecentRow) -> Self {
        Self {
            id: row.id,
            track_id: row.track_id,
            title: row.title,
            artist: artist_or_unknown(row.artist),
            album: album_or_unknown(row.album),
            album_art: row.album_art,
            duration: row.duration,
            played_at: row.played_at,
            played_seconds: row.played_seconds,
            completion_ratio: row.completion_ratio,
            completed: row.completed,
            source: row.source,
        }
    }
}

#[derive(sqlx::FromRow)]
pub(super) struct TotalsRow {
    pub(super) total_plays: i64,
    pub(super) total_minutes: f64,
    pub(super) unique_tracks: i64,
    pub(super) unique_artists: i64,
    pub(super) completed_plays: i64,
}

#[derive(sqlx::FromRow)]
pub(super) struct TopTrackRow {
    track_id: String,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    album_art: Option<String>,
    play_count: i64,
    listened_seconds: f64,
    last_played_at: String,
}

impl From<TopTrackRow> for ListeningStatsTrack {
    fn from(row: TopTrackRow) -> Self {
        Self {
            track_id: row.track_id,
            title: row.title,
            artist: artist_or_unknown(row.artist),
            album: album_or_unknown(row.album),
            album_art: row.album_art,
            play_count: count(row.play_count),
            listened_seconds: row.listened_seconds,
            last_played_at: row.last_played_at,
        }
    }
}

#[derive(sqlx::FromRow)]
pub(super) struct TopArtistRow {
    artist: Option<String>,
    play_count: i64,
    listened_seconds: f64,
}

impl From<TopArtistRow> for ListeningStatsArtist {
    fn from(row: TopArtistRow) -> Self {
        Self {
            artist: artist_or_unknown(row.artist),
            play_count: count(row.play_count),
            listened_seconds: row.listened_seconds,
        }
    }
}

#[derive(sqlx::FromRow)]
pub(super) struct ActivityRow {
    date: String,
    play_count: i64,
    listened_minutes: f64,
}

impl From<ActivityRow> for ListeningActivityPoint {
    fn from(row: ActivityRow) -> Self {
        Self {
            date: row.date,
            play_count: count(row.play_count),
            listened_minutes: row.listened_minutes,
        }
    }
}

/// `strftime` returns text, so the two bucket keys arrive as `"0"` and `"07"`
/// and are parsed here — as v1's `Number(row.dow)` did.
#[derive(sqlx::FromRow)]
pub(super) struct HourlyRow {
    dow: String,
    hour: String,
    play_count: i64,
    listened_minutes: f64,
}

impl From<HourlyRow> for ListeningHourlyActivityPoint {
    fn from(row: HourlyRow) -> Self {
        Self {
            day_of_week: row.dow.parse().unwrap_or(0),
            hour: row.hour.parse().unwrap_or(0),
            play_count: count(row.play_count),
            listened_minutes: row.listened_minutes,
        }
    }
}

#[derive(sqlx::FromRow)]
pub(super) struct AlbumRow {
    album: String,
    artist: String,
    album_art: Option<String>,
    play_count: i64,
}

impl From<AlbumRow> for ListeningAlbumStat {
    fn from(row: AlbumRow) -> Self {
        Self {
            album: row.album,
            artist: row.artist,
            album_art: row.album_art,
            play_count: count(row.play_count),
        }
    }
}
