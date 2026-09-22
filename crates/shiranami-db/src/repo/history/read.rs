//! The five aggregate reads over `play_history`.

use shiranami_core::constants::UNKNOWN_ARTIST;
use shiranami_core::models::{
    ListeningActivityPoint, ListeningHistoryEntry, ListeningHourlyActivityPoint,
    ListeningStatsSummary, WeeklyInsights,
};
use sqlx::SqliteConnection;

use super::rows::{ActivityRow, AlbumRow, HourlyRow, RecentRow, TopArtistRow, TopTrackRow};
use super::rows::{TotalsRow, count};
use crate::error::{DbError, Result};

/// More than this much idle time between consecutive plays starts a new
/// listening session.
const SESSION_GAP_MS: i64 = 30 * 60 * 1000;

/// [`recent`]'s page size when the caller names none, and the bounds it is
/// clamped to. v1's `Math.max(1, Math.min(100, limit ?? 30))`.
const RECENT_DEFAULT_LIMIT: i64 = 30;
const RECENT_MIN_LIMIT: i64 = 1;
const RECENT_MAX_LIMIT: i64 = 100;

/// How many entries the leaderboards return.
const TOP_LIMIT: i64 = 5;

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

    // Grouped on the RAW artist column — see [`super`]. Ties break on total
    // time listened.
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
/// `until` is **exclusive**, mirroring [`summary`] — it is what lets a closed
/// past window (a recap of a finished week, browsed later) recompute exactly,
/// without borrowing plays from the day the next window starts on.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn activity(
    conn: &mut SqliteConnection,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<Vec<ListeningActivityPoint>> {
    let rows = sqlx::query_as::<_, ActivityRow>(
        "SELECT substr(played_at, 1, 10)                     AS date, \
                COUNT(*)                                     AS play_count, \
                COALESCE(SUM(played_seconds) / 60.0, 0.0)    AS listened_minutes \
           FROM play_history \
          WHERE (?1 IS NULL OR played_at >= ?1) \
            AND (?2 IS NULL OR played_at < ?2) \
          GROUP BY substr(played_at, 1, 10) \
          ORDER BY substr(played_at, 1, 10)",
    )
    .bind(since)
    .bind(until)
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
/// `until` is **exclusive**, mirroring [`summary`] — see [`activity`].
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn hourly_activity(
    conn: &mut SqliteConnection,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<Vec<ListeningHourlyActivityPoint>> {
    let rows = sqlx::query_as::<_, HourlyRow>(
        "SELECT strftime('%w', played_at, 'localtime')       AS dow, \
                strftime('%H', played_at, 'localtime')       AS hour, \
                COUNT(*)                                     AS play_count, \
                COALESCE(SUM(played_seconds) / 60.0, 0.0)    AS listened_minutes \
           FROM play_history \
          WHERE (?1 IS NULL OR played_at >= ?1) \
            AND (?2 IS NULL OR played_at < ?2) \
          GROUP BY strftime('%w', played_at, 'localtime'), \
                   strftime('%H', played_at, 'localtime')",
    )
    .bind(since)
    .bind(until)
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
/// `until` is **exclusive**, mirroring [`summary`] — see [`activity`]. The
/// session walk only sees plays inside the window, exactly as v1's JavaScript
/// walk only saw the rows the (windowed) query handed it.
///
/// # Errors
///
/// Returns [`DbError::Query`] if either query fails.
pub async fn weekly_insights(
    conn: &mut SqliteConnection,
    since: Option<&str>,
    until: Option<&str>,
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
                MAX(COALESCE(NULLIF(TRIM(t.album_artist), ''), NULLIF(t.artist, ''), ?3)) \
                                                  AS artist, \
                MAX(t.album_art)                  AS album_art, \
                COUNT(*)                          AS play_count \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          WHERE (?1 IS NULL OR ph.played_at >= ?1) \
            AND (?2 IS NULL OR ph.played_at < ?2) \
          GROUP BY COALESCE(NULLIF(TRIM(t.album_artist), ''), ''), \
                   COALESCE(NULLIF(t.album, ''), '') \
         HAVING COALESCE(NULLIF(t.album, ''), '') <> '' \
          ORDER BY COUNT(*) DESC \
          LIMIT ?4",
    )
    .bind(since)
    .bind(until)
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
                    WHERE (?1 IS NULL OR played_at >= ?1) \
                      AND (?2 IS NULL OR played_at < ?2) \
               ) \
         ) \
         WHERE prev IS NULL OR (at - prev) > ?3",
    )
    .bind(since)
    .bind(until)
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
