//! The reads and writes behind the six `recommendations:*` channels.
//!
//! Like [`super::youtube_mappings`], this module backs **no** `db:*` channel.
//! Phase 7 ported the 45 database channels and neither `recommendations` nor
//! `negative_signals` has one: v1 reached both tables inline from
//! `apps/desktop/src/main/services/recommendation-service.ts`, which owns
//! channels in its own namespace. The service half of that file becomes
//! `shiranami_recommendation::service`, and it cannot aggregate anything
//! without these queries.
//!
//! # Why the folding is not done here
//!
//! v1's `getLibraryStats()` ran **three** queries and folded them in
//! JavaScript: the grouped play aggregate, the set of explicitly disliked
//! track ids, and the per-artist dislike counts. The obvious tidy-up is one
//! query with two `LEFT JOIN`s, and it is wrong in a way that does not show up
//! until a user has disliked something:
//!
//! - `artist_dislikes` is a count over *other* tracks by the same artist, so a
//!   join would have to subtract the row's own contribution inside the
//!   aggregate — v1 did that subtraction in the fold
//!   (`- (dislikedTrackIds.has(id) ? 1 : 0)`), and moving it into SQL changes
//!   which of `NULL`, `0` and "artist is untagged" it applies to.
//! - The dislike tables are tiny and the aggregate is not, so three small reads
//!   are cheaper than widening the big one.
//!
//! So this module returns the three shapes v1 read, and
//! [`shiranami_recommendation::service`] folds them exactly as the JavaScript
//! did. The fold is the ported logic; the SQL is this crate's.
//!
//! # The sentinels are deliberately absent
//!
//! Every other read in this crate collapses a `NULL` artist to
//! `UNKNOWN_ARTIST` for display. These do not: v1's recommendation service
//! collapsed to the **empty string**, and the scoring core treats `""` and
//! `UNKNOWN_ARTIST` identically only because it checks for both
//! (`is_real_artist`). Substituting the sentinel here would make a genuinely
//! untagged track match every other untagged track on the artist axis, which is
//! a similarity score v1 never produced.

use std::collections::{HashMap, HashSet};

use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection};

use crate::error::Result;
use crate::repo::conn::failed;

/// Track ids per `IN (…)` list, matching [`super::youtube_mappings::ID_CHUNK`]
/// and v1's `CHUNK_SIZE` in the similarity path.
const ID_CHUNK: usize = 500;

/// One row of the grouped play aggregate — v1's `getLibraryStats()` query.
///
/// The two dislike signals are **not** here; they arrive from
/// [`disliked_track_ids`] and [`artist_dislike_counts`] and are folded by the
/// caller. See the module docs.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct PlayStat {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display title.
    pub title: String,
    /// Display artist, `NULL` collapsed to `""` by the caller.
    pub artist: Option<String>,
    /// Display album, `NULL` collapsed to `""` by the caller.
    pub album: Option<String>,
    /// `COUNT(*)` of this track's plays.
    pub plays: i64,
    /// Mean completion ratio across those plays.
    pub avg_completion: f64,
    /// `MAX(played_at)`.
    pub last_played_at: String,
    /// Whether the user favourited the track.
    pub is_favorite: bool,
}

/// The two content axes similarity scores on, for one track.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct SimilarityRow {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display artist, `NULL` collapsed to `""` by the caller.
    pub artist: Option<String>,
    /// Display album, `NULL` collapsed to `""` by the caller.
    pub album: Option<String>,
}

/// The three columns smart-mix generation filters and ranks on.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct MixRow {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Free-text genre tag.
    pub genre: Option<String>,
    /// Release year.
    pub year: Option<i64>,
    /// Lifetime play count.
    pub play_count: Option<i64>,
}

/// A cached shelf, exactly as it sits in the `recommendations` table.
///
/// `payload` is left as text: whether it parses is the caller's staleness
/// decision, not a query failure. v1 marked an unparseable payload
/// `valid: false` and served an empty, stale shelf rather than erroring the
/// channel, and that only works if the row comes back raw.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct CachedShelf {
    /// The JSON array of shelf items, unparsed.
    pub payload: String,
    /// ISO-8601 instant the row was written.
    pub generated_at: String,
}

/// Every played track, grouped, with the joined display tags.
///
/// **No `since` window**: v1 scored over the whole lifetime of the history and
/// let the recency half-life do the time-weighting, so a window here would
/// apply the decay twice.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn play_stats(conn: &mut SqliteConnection) -> Result<Vec<PlayStat>> {
    sqlx::query_as::<_, PlayStat>(
        "SELECT t.id                                        AS track_id, \
                t.title                                     AS title, \
                t.artist                                    AS artist, \
                t.album                                     AS album, \
                COUNT(*)                                    AS plays, \
                COALESCE(AVG(ph.completion_ratio), 0.0)     AS avg_completion, \
                MAX(ph.played_at)                           AS last_played_at, \
                COALESCE(t.is_favorite, 0)                  AS is_favorite \
           FROM play_history ph \
           INNER JOIN tracks t ON ph.track_id = t.id \
          GROUP BY t.id",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(failed("aggregate the library's listening stats"))
}

/// The track ids the user marked "not interested".
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn disliked_track_ids(conn: &mut SqliteConnection) -> Result<HashSet<String>> {
    let ids: Vec<String> = sqlx::query_scalar("SELECT track_id FROM negative_signals")
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the disliked track ids"))?;

    Ok(ids.into_iter().collect())
}

/// How many "not interested" marks each artist carries.
///
/// Rows with a `NULL` artist are excluded rather than counted under a common
/// key, as v1's `WHERE artist IS NOT NULL` did — otherwise every untagged
/// dislike would penalise every other untagged track.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn artist_dislike_counts(conn: &mut SqliteConnection) -> Result<HashMap<String, i64>> {
    let rows = sqlx::query(
        "SELECT artist, COUNT(*) AS dislikes \
           FROM negative_signals \
          WHERE artist IS NOT NULL \
          GROUP BY artist",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(failed("count the per-artist dislikes"))?;

    let mut counts = HashMap::with_capacity(rows.len());
    for row in &rows {
        let artist: String = row
            .try_get("artist")
            .map_err(failed("read an artist dislike row"))?;
        let dislikes: i64 = row
            .try_get("dislikes")
            .map_err(failed("read an artist dislike row"))?;
        counts.insert(artist, dislikes);
    }

    Ok(counts)
}

/// Cover art for the ranked shelf, keyed by track id.
///
/// Tracks with no cached art are **absent from the map**, as they were absent
/// from v1's, so the caller writes `None` rather than an empty string.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn album_art_for(
    conn: &mut SqliteConnection,
    track_ids: &[String],
) -> Result<HashMap<String, String>> {
    if track_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut art = HashMap::with_capacity(track_ids.len());

    for chunk in track_ids.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT id, album_art FROM tracks WHERE album_art IS NOT NULL AND id IN (",
        );
        let mut list = builder.separated(", ");
        for id in chunk {
            list.push_bind(id.clone());
        }
        builder.push(")");

        let rows = builder
            .build()
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("read the recommended tracks' cover art"))?;

        for row in &rows {
            let id: String = row.try_get("id").map_err(failed("read a cover art row"))?;
            let album_art: String = row
                .try_get("album_art")
                .map_err(failed("read a cover art row"))?;
            art.insert(id, album_art);
        }
    }

    Ok(art)
}

/// Every track, with the three columns smart mixes need.
///
/// A whole-table scan with no history join, as v1's `getMixTracks()` was: a mix
/// is built from what the library *contains*, not from what has been played,
/// so a freshly imported library still produces mixes.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn mix_tracks(conn: &mut SqliteConnection) -> Result<Vec<MixRow>> {
    sqlx::query_as::<_, MixRow>("SELECT id AS track_id, genre, year, play_count FROM tracks")
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the library's mix candidates"))
}

/// The seed track's own content axes, if it is still in the library.
///
/// `None` is not an error: v1 logged and returned an empty result list, because
/// the renderer can ask for "more like this" on a track that was removed under
/// it.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn similarity_seed(
    conn: &mut SqliteConnection,
    track_id: &str,
) -> Result<Option<SimilarityRow>> {
    sqlx::query_as::<_, SimilarityRow>(
        "SELECT id AS track_id, artist, album FROM tracks WHERE id = ?1",
    )
    .bind(track_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(failed("read the similarity seed track"))
}

/// How many playlists each other track shares with the seed.
///
/// Two queries, as v1 had them: the seed's playlists, then every membership in
/// those playlists, tallied per track with the seed itself skipped. An empty
/// map when the seed is in no playlist, which short-circuits the second query.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if either query fails.
pub async fn shared_playlist_counts(
    conn: &mut SqliteConnection,
    track_id: &str,
) -> Result<HashMap<String, u32>> {
    let playlist_ids: Vec<String> =
        sqlx::query_scalar("SELECT playlist_id FROM playlist_tracks WHERE track_id = ?1")
            .bind(track_id)
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("read the seed track's playlists"))?;

    if playlist_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut counts: HashMap<String, u32> = HashMap::new();

    for chunk in playlist_ids.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id IN (",
        );
        let mut list = builder.separated(", ");
        for id in chunk {
            list.push_bind(id.clone());
        }
        builder.push(")");

        let rows = builder
            .build()
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("read the co-membership of the seed's playlists"))?;

        for row in &rows {
            let member: String = row
                .try_get("track_id")
                .map_err(failed("read a playlist membership row"))?;
            if member == track_id {
                continue;
            }
            *counts.entry(member).or_insert(0) += 1;
        }
    }

    Ok(counts)
}

/// The candidate pool for a similarity ranking.
///
/// **A prefilter, not a scan.** v1 assembled a disjunction of the axes that can
/// score above zero — same artist, same album, or co-membership in one of the
/// seed's playlists — and only scored what came back. Selecting the whole
/// library instead would return the same ranking (every other row scores 0 and
/// is dropped) at the cost of reading every track for every "more like this".
///
/// `artist` and `album` are passed already sentinel-checked by the caller:
/// `None` means "this axis cannot match", which is what the scoring core's
/// `is_real_artist` / `is_real_album` decide. Passing an empty string instead
/// would match every untagged track in the library.
///
/// Returns an empty pool — without querying — when no axis can match, as v1's
/// `if (axisClauses.length === 0) return []` did.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn similarity_candidates(
    conn: &mut SqliteConnection,
    seed_id: &str,
    artist: Option<&str>,
    album: Option<&str>,
    co_member_ids: &[String],
) -> Result<Vec<SimilarityRow>> {
    if artist.is_none() && album.is_none() && co_member_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT id AS track_id, artist, album FROM tracks WHERE id != ",
    );
    builder.push_bind(seed_id.to_owned());
    builder.push(" AND (");

    // Tracks whether a disjunct has already been written, so the `OR`s land
    // between the clauses and never before the first one.
    let mut written = false;
    let separate = |builder: &mut QueryBuilder<Sqlite>, written: &mut bool| {
        if *written {
            builder.push(" OR ");
        }
        *written = true;
    };

    if let Some(artist) = artist {
        separate(&mut builder, &mut written);
        builder.push("artist = ");
        builder.push_bind(artist.to_owned());
    }
    if let Some(album) = album {
        separate(&mut builder, &mut written);
        builder.push("album = ");
        builder.push_bind(album.to_owned());
    }
    for chunk in co_member_ids.chunks(ID_CHUNK) {
        separate(&mut builder, &mut written);
        builder.push("id IN (");
        let mut list = builder.separated(", ");
        for id in chunk {
            list.push_bind(id.clone());
        }
        builder.push(")");
    }

    builder.push(")");

    let rows = builder
        .build_query_as::<SimilarityRow>()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the similarity candidates"))?;

    Ok(rows)
}

/// The cached shelf row for one kind, if it has ever been written.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn read_shelf(conn: &mut SqliteConnection, kind: &str) -> Result<Option<CachedShelf>> {
    sqlx::query_as::<_, CachedShelf>(
        "SELECT payload, generated_at FROM recommendations WHERE kind = ?1",
    )
    .bind(kind)
    .fetch_optional(&mut *conn)
    .await
    .map_err(failed("read the cached recommendation shelf"))
}

/// Replace the cached shelf for one kind.
///
/// `generated_at` is a parameter rather than the column default because the
/// caller returns the same instant to the renderer, and reading it back to
/// learn what was just written would be a second round-trip for a value the
/// caller already holds.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the statement fails.
pub async fn write_shelf(
    conn: &mut SqliteConnection,
    kind: &str,
    payload: &str,
    generated_at: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO recommendations (kind, payload, generated_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT (kind) DO UPDATE \
            SET payload = excluded.payload, generated_at = excluded.generated_at",
    )
    .bind(kind)
    .bind(payload)
    .bind(generated_at)
    .execute(&mut *conn)
    .await
    .map_err(failed("cache the recommendation shelf"))?;

    Ok(())
}

/// Drop the cached shelf for one kind, so the next read recomputes it.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the statement fails.
pub async fn delete_shelf(conn: &mut SqliteConnection, kind: &str) -> Result<()> {
    sqlx::query("DELETE FROM recommendations WHERE kind = ?1")
        .bind(kind)
        .execute(&mut *conn)
        .await
        .map_err(failed("invalidate the cached recommendation shelf"))?;

    Ok(())
}

/// The artist tag of one track, and whether the track exists at all.
///
/// `Ok(None)` means no such track; `Ok(Some(None))` means the track exists with
/// an untagged artist. The two are different answers and the caller branches on
/// both — a missing track is a silent no-op, an untagged one is a real signal
/// with a `NULL` artist.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the query fails.
pub async fn track_artist(
    conn: &mut SqliteConnection,
    track_id: &str,
) -> Result<Option<Option<String>>> {
    sqlx::query_scalar("SELECT artist FROM tracks WHERE id = ?1")
        .bind(track_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the track's artist"))
}

/// Record a "not interested" mark, replacing any earlier one for the track.
///
/// The conflict target is `track_id`, the `UNIQUE` column — not the primary
/// key — so re-marking a track keeps the original row id and refreshes only the
/// denormalised artist and the source, which is what v1's `onConflictDoUpdate`
/// did.
///
/// `artist` is denormalised at write time on purpose: the per-artist penalty
/// has to keep working after the track row is edited or deleted, and v1 read
/// the artist off the track at exactly this moment.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the statement fails.
pub async fn add_negative_signal(
    conn: &mut SqliteConnection,
    id: &str,
    track_id: &str,
    artist: Option<&str>,
    source: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO negative_signals (id, track_id, artist, source) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT (track_id) DO UPDATE \
            SET artist = excluded.artist, source = excluded.source",
    )
    .bind(id)
    .bind(track_id)
    .bind(artist)
    .bind(source)
    .execute(&mut *conn)
    .await
    .map_err(failed("mark the track not interested"))?;

    Ok(())
}

/// Undo a "not interested" mark. Removing one that was never there is not an
/// error, as it was not in v1.
///
/// # Errors
///
/// Returns [`crate::DbError::Query`] if the statement fails.
pub async fn remove_negative_signal(conn: &mut SqliteConnection, track_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM negative_signals WHERE track_id = ?1")
        .bind(track_id)
        .execute(&mut *conn)
        .await
        .map_err(failed("undo the not-interested mark"))?;

    Ok(())
}
