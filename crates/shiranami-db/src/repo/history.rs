//! Play history: recording a play, and the six read shapes built on top of it.
//!
//! Ported from `apps/desktop/src/main/ipc/database/history.ts`. Six channels,
//! five of them aggregate SQL, and the aggregates are where the fidelity risk
//! lives — a `GROUP BY` moved one expression to the left changes what a user's
//! "top artists" card says without changing a type or failing a test that only
//! checks shapes. Each query below is annotated where it looks arbitrary.
//!
//! # Two things that must not be tidied
//!
//! **`played_at` is written in JavaScript's ISO format, not SQLite's.** The
//! column's `DEFAULT (datetime('now'))` produces `2026-08-01 12:34:56`, while
//! v1 always passed `new Date().toISOString()` — `2026-08-01T12:34:56.789Z`.
//! Every row in every shipped database therefore has the second form, and the
//! column is compared, ordered, and grouped as **text**. Letting a single row
//! fall back to the column default would sort it before every real row for the
//! next thousand years, because `'2'` … no: because `' '` (0x20) sorts below
//! `'T'` (0x54). [`record_play`] takes the timestamp as an argument for exactly
//! this reason and never relies on the default.
//!
//! **The unknown-artist collapse happens after grouping, not before.** v1 read
//! the raw nullable column, grouped on it, and only then substituted
//! `UNKNOWN_ARTIST` for display. Folding a `COALESCE` into the `GROUP BY` would
//! merge untagged tracks with tracks genuinely tagged "Unknown Artist" — a
//! different answer, silently. The tests pin the distinction.
//!
//! # Windowing
//!
//! Every read takes an optional `since` (and the summary an optional exclusive
//! `until`). Rather than assembling SQL per combination, the filters are always
//! present as `?n IS NULL OR …`, so each query is one `&'static str` with
//! nothing interpolated. The aggregates scan the table regardless of the
//! window, so nothing is lost; [`recent`] still walks
//! `idx_play_history_played_at` in reverse for its `ORDER BY … LIMIT`.

use shiranami_core::constants::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_core::models::{
    ListeningActivityPoint, ListeningAlbumStat, ListeningHistoryEntry,
    ListeningHourlyActivityPoint, ListeningStatsArtist, ListeningStatsSummary, ListeningStatsTrack,
    PlayHistoryRecord, RecordPlayInput, WeeklyInsights,
};
use sqlx::{Connection, SqliteConnection};

use crate::error::{DbError, Result};

/// A play counts as complete at this fraction of a known track length.
const COMPLETION_THRESHOLD: f64 = 0.95;

/// Playback origin assumed when the renderer sends none.
const DEFAULT_SOURCE: &str = "library";

/// More than this much idle time between consecutive plays starts a new
/// listening session.
const SESSION_GAP_MS: i64 = 30 * 60 * 1000;

/// `recent`'s page size when the caller names none, and the bounds it is
/// clamped to. v1's `Math.max(1, Math.min(100, limit ?? 30))`.
const RECENT_DEFAULT_LIMIT: i64 = 30;
const RECENT_MIN_LIMIT: i64 = 1;
const RECENT_MAX_LIMIT: i64 = 100;

/// How many entries the leaderboards return.
const TOP_LIMIT: i64 = 5;

/// The track tags [`record_play`] reads back for the scrobbler.
///
/// Not a wire type and deliberately not in `shiranami-core`: the renderer never
/// sees it. v1 returned it from the same transaction as the insert so that
/// submitting a scrobble did not cost a second round-trip, and this preserves
/// that.
#[derive(Debug, Clone, PartialEq)]
pub struct PlayedTrackTags {
    /// Track title.
    pub title: String,
    /// Track artist, raw — `None` when the column is `NULL`. Uncollapsed on
    /// purpose: a scrobble tagged "Unknown Artist" is worse than no scrobble,
    /// and the caller decides.
    pub artist: Option<String>,
    /// Track album, raw.
    pub album: Option<String>,
    /// Track length in seconds, as tagged.
    pub duration: Option<f64>,
}

/// What [`record_play`] committed.
#[derive(Debug, Clone, PartialEq)]
pub struct RecordedPlay {
    /// The inserted `play_history` row — the value the channel returns.
    pub entry: PlayHistoryRecord,
    /// Tags of the track whose `play_count` was bumped.
    ///
    /// `None` only if the `UPDATE` matched nothing, which the foreign key on
    /// `play_history.track_id` makes unreachable: the insert above it would
    /// have failed first. Kept optional because v1 checked it too, and because
    /// a future migration that drops the constraint should not become a panic.
    pub track: Option<PlayedTrackTags>,
}

/// Record one finished play and bump the track's lifetime play count.
///
/// `id` is the new row's primary key and `now` the ISO-8601 timestamp for both
/// `played_at` and the track's `updated_at` — see the module docs for why they
/// are arguments and why the format matters. v1 called `new Date()` twice,
/// microseconds apart; one value for both is the same thing said once.
///
/// The two statements share a transaction, as they did in v1: a play that is
/// counted in the history but not in `tracks.play_count` (or the reverse) is a
/// permanent inconsistency in data nothing ever recomputes.
///
/// # Errors
///
/// Returns [`DbError::Query`] if either statement fails — including the foreign
/// key violation raised when `track_id` names no track.
pub async fn record_play(
    conn: &mut SqliteConnection,
    id: &str,
    now: &str,
    input: &RecordPlayInput,
) -> Result<RecordedPlay> {
    // v1's arithmetic, branch for branch. `duration` is nullable and may be
    // zero or negative from a malformed tag, so the ratio guards on `> 0` while
    // `completed` guards only on "present and non-zero" — matching JavaScript
    // truthiness, under which a negative duration is truthy and yields a ratio
    // of 0, hence `completed == false`.
    let played_seconds = input.played_seconds.max(0.0);
    let completion_ratio = match input.duration {
        Some(duration) if duration > 0.0 => (played_seconds / duration).min(1.0),
        _ => 0.0,
    };
    let completed = match input.duration {
        Some(duration) if duration != 0.0 => completion_ratio >= COMPLETION_THRESHOLD,
        _ => false,
    };
    let source = input.source.as_deref().unwrap_or(DEFAULT_SOURCE);

    let mut tx = conn.begin().await.map_err(|source| DbError::Query {
        operation: "begin the record-play transaction",
        source,
    })?;

    let entry = sqlx::query_as::<_, PlayHistoryRow>(
        "INSERT INTO play_history \
           (id, track_id, played_at, played_seconds, completion_ratio, completed, source) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         RETURNING id, track_id, played_at, played_seconds, completion_ratio, completed, source",
    )
    .bind(id)
    .bind(&input.track_id)
    .bind(now)
    .bind(played_seconds)
    .bind(completion_ratio)
    .bind(completed)
    .bind(source)
    .fetch_one(&mut *tx)
    .await
    .map_err(|source| DbError::Query {
        operation: "record the play in the listening history",
        source,
    })?;

    // `COALESCE` because `play_count` is nullable with a default of 0 — a row
    // written before that default existed can still hold NULL, and `NULL + 1`
    // is NULL, which would quietly un-count every future play of that track.
    let track = sqlx::query_as::<_, PlayedTrackTagsRow>(
        "UPDATE tracks \
            SET play_count = COALESCE(play_count, 0) + 1, updated_at = ?1 \
          WHERE id = ?2 \
         RETURNING title, artist, album, duration",
    )
    .bind(now)
    .bind(&input.track_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|source| DbError::Query {
        operation: "increment the track's play count",
        source,
    })?;

    tx.commit().await.map_err(|source| DbError::Query {
        operation: "commit the record-play transaction",
        source,
    })?;

    Ok(RecordedPlay {
        entry: entry.into(),
        track: track.map(Into::into),
    })
}

/// The most recent plays, newest first, joined to their tracks.
///
/// `limit` is clamped to `1..=100` and defaults to 30, as v1 clamped it. The
/// join is inner, so a play whose track has been deleted does not appear —
/// though the `ON DELETE CASCADE` on `play_history.track_id` means the row is
/// already gone.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn recent(
    conn: &mut SqliteConnection,
    limit: Option<i64>,
    since: Option<&str>,
) -> Result<Vec<ListeningHistoryEntry>> {
    let limit = limit
        .unwrap_or(RECENT_DEFAULT_LIMIT)
        .clamp(RECENT_MIN_LIMIT, RECENT_MAX_LIMIT);

    let rows = sqlx::query_as::<_, RecentRow>(
        "SELECT ph.id, ph.track_id, ph.played_at, ph.played_seconds, ph.completion_ratio, \
                ph.completed, ph.source, \
                t.title, t.artist, t.album, t.album_art, t.duration \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          WHERE ?1 IS NULL OR ph.played_at >= ?1 \
          ORDER BY ph.played_at DESC \
          LIMIT ?2",
    )
    .bind(since)
    .bind(limit)
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the recent listening history",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Totals plus the top-five track and artist leaderboards for one window.
///
/// `until` is **exclusive**, which is what lets the renderer ask for "the seven
/// days before the current seven" to compute a week-over-week trend without the
/// two windows overlapping on a shared boundary.
///
/// # Errors
///
/// Returns [`DbError::Query`] if any of the three queries fails.
pub async fn summary(
    conn: &mut SqliteConnection,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<ListeningStatsSummary> {
    // An aggregate with no GROUP BY always returns exactly one row, even over
    // an empty window, so this is `fetch_one` rather than `fetch_optional`.
    //
    // `COUNT(DISTINCT t.artist)` skips NULLs by SQL's rules — untagged tracks
    // do not contribute a phantom artist. v1 depended on that; keep it.
    let totals = sqlx::query_as::<_, TotalsRow>(
        "SELECT COUNT(*)                                     AS total_plays, \
                COALESCE(SUM(ph.played_seconds) / 60.0, 0.0) AS total_minutes, \
                COUNT(DISTINCT ph.track_id)                  AS unique_tracks, \
                COUNT(DISTINCT t.artist)                     AS unique_artists, \
                COALESCE(SUM(CASE WHEN ph.completed THEN 1 ELSE 0 END), 0) AS completed_plays \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          WHERE (?1 IS NULL OR ph.played_at >= ?1) \
            AND (?2 IS NULL OR ph.played_at < ?2)",
    )
    .bind(since)
    .bind(until)
    .fetch_one(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the listening summary totals",
        source,
    })?;

    // Ties on play count break on the most recent play, so a leaderboard is
    // stable rather than reordering on every unrelated write.
    let top_tracks = sqlx::query_as::<_, TopTrackRow>(
        "SELECT t.id AS track_id, t.title, t.artist, t.album, t.album_art, \
                COUNT(*)                                AS play_count, \
                COALESCE(SUM(ph.played_seconds), 0.0)   AS listened_seconds, \
                MAX(ph.played_at)                       AS last_played_at \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          WHERE (?1 IS NULL OR ph.played_at >= ?1) \
            AND (?2 IS NULL OR ph.played_at < ?2) \
          GROUP BY t.id \
          ORDER BY COUNT(*) DESC, MAX(ph.played_at) DESC \
          LIMIT ?3",
    )
    .bind(since)
    .bind(until)
    .bind(TOP_LIMIT)
    .fetch_all(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the most played tracks",
        source,
    })?;

    // Grouped on the RAW artist column — see the module docs. Ties break on
    // total time listened.
    let top_artists = sqlx::query_as::<_, TopArtistRow>(
        "SELECT t.artist, \
                COUNT(*)                              AS play_count, \
                COALESCE(SUM(ph.played_seconds), 0.0) AS listened_seconds \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          WHERE (?1 IS NULL OR ph.played_at >= ?1) \
            AND (?2 IS NULL OR ph.played_at < ?2) \
          GROUP BY t.artist \
          ORDER BY COUNT(*) DESC, COALESCE(SUM(ph.played_seconds), 0.0) DESC \
          LIMIT ?3",
    )
    .bind(since)
    .bind(until)
    .bind(TOP_LIMIT)
    .fetch_all(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the most played artists",
        source,
    })?;

    Ok(ListeningStatsSummary {
        total_plays: count(totals.total_plays),
        total_minutes: totals.total_minutes,
        unique_tracks: count(totals.unique_tracks),
        unique_artists: count(totals.unique_artists),
        completed_plays: count(totals.completed_plays),
        top_tracks: top_tracks.into_iter().map(Into::into).collect(),
        top_artists: top_artists.into_iter().map(Into::into).collect(),
    })
}

/// Plays and minutes per calendar day, oldest first.
///
/// The day key is `substr(played_at, 1, 10)` — the date part of the stored
/// timestamp, which is UTC. Deliberately *not* localised, unlike
/// [`hourly_activity`]: this feeds a contribution-graph style calendar where
/// stable, timezone-independent day boundaries matter more than matching the
/// user's midnight, and v1 made the same split.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn activity(
    conn: &mut SqliteConnection,
    since: Option<&str>,
) -> Result<Vec<ListeningActivityPoint>> {
    let rows = sqlx::query_as::<_, ActivityRow>(
        "SELECT substr(played_at, 1, 10)                     AS date, \
                COUNT(*)                                     AS play_count, \
                COALESCE(SUM(played_seconds) / 60.0, 0.0)    AS listened_minutes \
           FROM play_history \
          WHERE ?1 IS NULL OR played_at >= ?1 \
          GROUP BY substr(played_at, 1, 10) \
          ORDER BY substr(played_at, 1, 10)",
    )
    .bind(since)
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the listening activity by day",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Plays and minutes bucketed by local day-of-week and hour.
///
/// Localised, unlike [`activity`], because the question it answers is "when do
/// you listen" and an answer of "23:00" has to mean the user's 23:00. SQLite's
/// `%w` is Sunday-indexed (`0` = Sunday); the renderer remaps to a Monday-first
/// grid.
///
/// **Deliberately unordered**, as v1 left it: the renderer indexes the result
/// into a 7×24 grid by key, so any order works, and adding an `ORDER BY` would
/// be a sort no caller asked for. Tests sort before asserting.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn hourly_activity(
    conn: &mut SqliteConnection,
    since: Option<&str>,
) -> Result<Vec<ListeningHourlyActivityPoint>> {
    let rows = sqlx::query_as::<_, HourlyRow>(
        "SELECT strftime('%w', played_at, 'localtime')       AS dow, \
                strftime('%H', played_at, 'localtime')       AS hour, \
                COUNT(*)                                     AS play_count, \
                COALESCE(SUM(played_seconds) / 60.0, 0.0)    AS listened_minutes \
           FROM play_history \
          WHERE ?1 IS NULL OR played_at >= ?1 \
          GROUP BY strftime('%w', played_at, 'localtime'), \
                   strftime('%H', played_at, 'localtime')",
    )
    .bind(since)
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the listening activity by hour",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// The weekly-insights card: session count and the top-five albums.
///
/// # Errors
///
/// Returns [`DbError::Query`] if either query fails.
pub async fn weekly_insights(
    conn: &mut SqliteConnection,
    since: Option<&str>,
) -> Result<WeeklyInsights> {
    // Albums, with three expressions that each fix a specific way the naive
    // version is wrong (all three are v1's, verbatim in intent):
    //
    //  * group on the album-artist TAG, not the track artist — otherwise an
    //    untagged various-artists compilation fragments into one entry per
    //    contributing artist;
    //  * display falls back album-artist → artist → sentinel, so an untagged
    //    album's card is not blank;
    //  * `HAVING album <> ''` drops the empty-album bucket, which in an
    //    untagged library would otherwise dominate the chart as a single
    //    enormous nameless "album".
    let top_albums = sqlx::query_as::<_, AlbumRow>(
        "SELECT COALESCE(NULLIF(t.album, ''), '') AS album, \
                MAX(COALESCE(NULLIF(TRIM(t.album_artist), ''), NULLIF(t.artist, ''), ?2)) \
                                                  AS artist, \
                MAX(t.album_art)                  AS album_art, \
                COUNT(*)                          AS play_count \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          WHERE ?1 IS NULL OR ph.played_at >= ?1 \
          GROUP BY COALESCE(NULLIF(TRIM(t.album_artist), ''), ''), \
                   COALESCE(NULLIF(t.album, ''), '') \
         HAVING COALESCE(NULLIF(t.album, ''), '') <> '' \
          ORDER BY COUNT(*) DESC \
          LIMIT ?3",
    )
    .bind(since)
    .bind(UNKNOWN_ARTIST)
    .bind(TOP_LIMIT)
    .fetch_all(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the most played albums",
        source,
    })?;

    // Gap-based session count. v1 pulled every timestamp in the window and
    // walked them in JavaScript, starting a new session whenever the idle gap
    // exceeded 30 minutes. The same walk expressed as a window function keeps
    // it to one query and, more to the point, keeps ISO-8601 parsing out of
    // this crate — `julianday` is SQLite's own parser, and shiranami-core has
    // no date type to borrow.
    //
    // **Timestamps become integer milliseconds before anything is compared.**
    // v1 compared `Date.getTime()` values, which are exact integers; a julian
    // day is a float around 2.46e6, where one ULP is ~0.04 ms. Scaling that
    // directly to milliseconds made a gap of exactly 30 minutes measure as
    // 1800000.00004 and start a session it should have continued — caught by
    // the boundary test, which is the only reason this is not a rounding error
    // shipped into someone's stats. Subtracting the epoch first drops the
    // magnitude to ~2e4, where rounding to the nearest millisecond is exact.
    //
    // `prev IS NULL` is the first row, which v1 counted too (its `lastMs`
    // started at -Infinity). One divergence, on data that cannot occur: if a
    // `played_at` were unparseable, `julianday` yields NULL and v1's `continue`
    // would skip it *without* advancing its cursor, whereas the LAG here treats
    // it as the predecessor and counts the next row as a new session. Every row
    // in every shipped database was written by `toISOString()`.
    let session_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ( \
             SELECT at, LAG(at) OVER (ORDER BY played_at) AS prev \
               FROM ( \
                   SELECT played_at, \
                          CAST(ROUND((julianday(played_at) - 2440587.5) * 86400000.0) \
                               AS INTEGER) AS at \
                     FROM play_history \
                    WHERE ?1 IS NULL OR played_at >= ?1 \
               ) \
         ) \
         WHERE prev IS NULL OR (at - prev) > ?2",
    )
    .bind(since)
    .bind(SESSION_GAP_MS)
    .fetch_one(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "count the listening sessions",
        source,
    })?;

    Ok(WeeklyInsights {
        session_count: count(session_count),
        top_albums: top_albums.into_iter().map(Into::into).collect(),
    })
}

/// Narrow a SQL count to the wire type's `u32`.
///
/// Saturating rather than fallible: a count cannot be negative and cannot
/// plausibly exceed `u32::MAX`, and a play-count card is not worth an error
/// path that can only fire on a database no filesystem could hold.
fn count(value: i64) -> u32 {
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

// The row structs below exist because the wire models live in
// `shiranami-core`, which does not (and should not) depend on sqlx. Each one
// decodes a query and converts; the conversion is where nullable columns meet
// the non-null wire fields.

#[derive(sqlx::FromRow)]
struct PlayHistoryRow {
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
struct PlayedTrackTagsRow {
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
struct RecentRow {
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
struct TotalsRow {
    total_plays: i64,
    total_minutes: f64,
    unique_tracks: i64,
    unique_artists: i64,
    completed_plays: i64,
}

#[derive(sqlx::FromRow)]
struct TopTrackRow {
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
struct TopArtistRow {
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
struct ActivityRow {
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
struct HourlyRow {
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
struct AlbumRow {
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
