//! `db:playlists:*` — the membership half.
//!
//! The seven channels that operate on `playlist_tracks` rather than on
//! `playlists`. Ported from `apps/desktop/src/main/ipc/database/playlists.ts`.
//!
//! Membership is *ordered* and *idempotent*, and both properties are enforced
//! in two places at once. `UNIQUE(playlist_id, track_id)` is the backstop; the
//! read-then-write inside a transaction is what turns a would-be constraint
//! error into a no-op. v1 wrapped these in transactions even though its handler
//! bodies were synchronous, on the reasoning that the next `await` introduced
//! would otherwise let two adds compute the same next position — in Rust every
//! one of these calls really does await, so the reasoning is now load-bearing
//! rather than defensive.

use std::collections::HashSet;

use shiranami_core::models::Track;
use sqlx::{Connection, QueryBuilder, Sqlite, SqliteConnection};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::conn::failed;
use crate::repo::ids;
use crate::repo::track_row::{self, TRACK_SELECT};

/// Membership rows per `INSERT`, as v1 sized it. Four columns each.
const INSERT_CHUNK: usize = 100;

/// Ids per `IN (…)` list, as v1 sized it.
const ID_CHUNK: usize = 500;

/// Positions rewritten per `UPDATE`, as v1 sized it.
///
/// A set-based `CASE`, so a 1,000-track drag-and-drop runs ten statements
/// rather than a thousand.
const REORDER_CHUNK: usize = 100;

/// A playlist's tracks, in playlist order.
///
/// No tie-break on `position`: two rows can only share one after a partial
/// reorder, and v1 left that order to the planner too.
pub async fn get_tracks(conn: &mut SqliteConnection, playlist_id: &str) -> Result<Vec<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    builder.push(" INNER JOIN playlist_tracks ON tracks.id = playlist_tracks.track_id");
    builder.push(" WHERE playlist_tracks.playlist_id = ");
    builder.push_bind(playlist_id.to_owned());
    builder.push(" ORDER BY playlist_tracks.position");

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the playlist's tracks"))?;

    track_row::tracks(&rows)
}

/// Append one track, returning the membership row's id.
///
/// Idempotent: a track already in the playlist yields the id of the row that is
/// already there, and nothing is written. That is the contract the preload API
/// documents, and the reason the caller gets an id rather than a row — v1's two
/// branches returned different shapes and every caller only ever read `id`.
pub async fn add_track(
    conn: &mut SqliteConnection,
    playlist_id: &str,
    track_id: &str,
) -> Result<String> {
    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the playlist add"))?;

    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
    )
    .bind(playlist_id)
    .bind(track_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(failed("look up the playlist membership"))?;

    if let Some(id) = existing {
        tx.commit().await.map_err(failed("add the track"))?;
        return Ok(id);
    }

    let id = Uuid::new_v4().to_string();
    let position = next_position(&mut tx, playlist_id).await?;

    sqlx::query(
        "INSERT INTO playlist_tracks (id, playlist_id, track_id, position) \
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&id)
    .bind(playlist_id)
    .bind(track_id)
    .bind(position)
    .execute(&mut *tx)
    .await
    .map_err(failed("add the track to the playlist"))?;

    tx.commit().await.map_err(failed("add the track"))?;

    Ok(id)
}

/// Append many tracks, skipping the ones already there.
///
/// De-duplicates against both the playlist's current membership and the
/// incoming list itself, then assigns positions from the current maximum in
/// input order — computing the base once rather than once per track, which is
/// what stops N serial adds from interleaving.
pub async fn add_tracks(
    conn: &mut SqliteConnection,
    playlist_id: &str,
    track_ids: &[String],
) -> Result<()> {
    if track_ids.is_empty() {
        return Ok(());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the playlist add"))?;

    let present: HashSet<String> =
        sqlx::query_scalar("SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1")
            .bind(playlist_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(failed("read the playlist membership"))?
            .into_iter()
            .collect();

    let base = next_position(&mut tx, playlist_id).await?;

    let wanted: Vec<String> = ids::unique(track_ids.iter().cloned())
        .into_iter()
        .filter(|track_id| !present.contains(track_id))
        .collect();

    if !wanted.is_empty() {
        insert_membership(&mut tx, playlist_id, &wanted, base).await?;
    }

    tx.commit().await.map_err(failed("add the tracks"))?;

    Ok(())
}

/// Remove one track from a playlist.
pub async fn remove_track(
    conn: &mut SqliteConnection,
    playlist_id: &str,
    track_id: &str,
) -> Result<()> {
    sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2")
        .bind(playlist_id)
        .bind(track_id)
        .execute(&mut *conn)
        .await
        .map_err(failed("remove the track from the playlist"))?;

    Ok(())
}

/// Remove many tracks from a playlist, in one transaction.
pub async fn remove_tracks(
    conn: &mut SqliteConnection,
    playlist_id: &str,
    track_ids: &[String],
) -> Result<()> {
    if track_ids.is_empty() {
        return Ok(());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the playlist removal"))?;

    for chunk in track_ids.chunks(ID_CHUNK) {
        let mut builder =
            QueryBuilder::<Sqlite>::new("DELETE FROM playlist_tracks WHERE playlist_id = ");
        builder.push_bind(playlist_id.to_owned());
        builder.push(" AND track_id IN (");
        let mut list = builder.separated(", ");
        for track_id in chunk {
            list.push_bind(track_id.clone());
        }
        builder.push(")");

        builder
            .build()
            .execute(&mut *tx)
            .await
            .map_err(failed("remove the tracks from the playlist"))?;
    }

    tx.commit()
        .await
        .map_err(failed("remove the tracks from the playlist"))?;

    Ok(())
}

/// Which playlists contain *every* one of these tracks.
///
/// The `HAVING` counts distinct matches per playlist against the number of
/// distinct ids asked for, so a playlist holding two of three does not qualify.
/// Not chunked, and cannot be: the count is over the whole set, so splitting it
/// would change the answer rather than just the statement count.
pub async fn get_playlists_for_tracks(
    conn: &mut SqliteConnection,
    track_ids: &[String],
) -> Result<Vec<String>> {
    let unique = ids::unique(track_ids.iter().cloned());

    if unique.is_empty() {
        return Ok(Vec::new());
    }

    let mut builder =
        QueryBuilder::<Sqlite>::new("SELECT playlist_id FROM playlist_tracks WHERE track_id IN (");
    let mut list = builder.separated(", ");
    for track_id in &unique {
        list.push_bind(track_id.clone());
    }
    builder.push(") GROUP BY playlist_id HAVING COUNT(DISTINCT track_id) = ");
    builder.push_bind(i64::try_from(unique.len()).unwrap_or(i64::MAX));

    builder
        .build_query_scalar()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("find the playlists holding these tracks"))
}

/// Rewrite a playlist's order to match the supplied sequence.
///
/// Only `position` changes — membership row ids are preserved, so nothing that
/// holds one goes stale. Ids not currently in the playlist are simply not
/// matched by the `WHERE`.
pub async fn reorder(
    conn: &mut SqliteConnection,
    playlist_id: &str,
    track_ids: &[String],
) -> Result<()> {
    if track_ids.is_empty() {
        return Ok(());
    }

    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the playlist reorder"))?;

    for (index, chunk) in track_ids.chunks(REORDER_CHUNK).enumerate() {
        let base = index * REORDER_CHUNK;

        let mut builder =
            QueryBuilder::<Sqlite>::new("UPDATE playlist_tracks SET position = CASE track_id");
        for (offset, track_id) in chunk.iter().enumerate() {
            builder.push(" WHEN ");
            builder.push_bind(track_id.clone());
            builder.push(" THEN ");
            builder.push_bind(i64::try_from(base + offset).unwrap_or(i64::MAX));
        }
        builder.push(" END WHERE playlist_id = ");
        builder.push_bind(playlist_id.to_owned());
        builder.push(" AND track_id IN (");
        let mut list = builder.separated(", ");
        for track_id in chunk {
            list.push_bind(track_id.clone());
        }
        builder.push(")");

        builder
            .build()
            .execute(&mut *tx)
            .await
            .map_err(failed("reorder the playlist"))?;
    }

    tx.commit().await.map_err(failed("reorder the playlist"))?;

    Ok(())
}

/// The position an appended track would take: one past the current maximum.
///
/// `COALESCE(MAX(position), -1) + 1` so an empty playlist starts at zero.
/// Takes a connection because both callers are already inside a transaction on
/// one — reading the maximum outside it is what would let two appends collide.
async fn next_position(conn: &mut SqliteConnection, playlist_id: &str) -> Result<i64> {
    sqlx::query_scalar(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
    )
    .bind(playlist_id)
    .fetch_one(&mut *conn)
    .await
    .map_err(failed("find the end of the playlist"))
}

/// Insert membership rows for `track_ids`, positioned from `base` in order.
///
/// Shared by the three channels that add membership. Chunked, and always
/// handed the transaction its caller opened rather than a bare connection.
pub(crate) async fn insert_membership(
    conn: &mut SqliteConnection,
    playlist_id: &str,
    track_ids: &[String],
    base: i64,
) -> Result<()> {
    for (index, chunk) in track_ids.chunks(INSERT_CHUNK).enumerate() {
        let chunk_base = base + i64::try_from(index * INSERT_CHUNK).unwrap_or(0);

        let mut builder = QueryBuilder::<Sqlite>::new(
            "INSERT INTO playlist_tracks (id, playlist_id, track_id, position) ",
        );
        builder.push_values(chunk.iter().enumerate(), |mut row, (offset, track_id)| {
            row.push_bind(Uuid::new_v4().to_string())
                .push_bind(playlist_id.to_owned())
                .push_bind(track_id.clone())
                .push_bind(chunk_base + i64::try_from(offset).unwrap_or(0));
        });

        builder
            .build()
            .execute(&mut *conn)
            .await
            .map_err(failed("add the tracks to the playlist"))?;
    }

    Ok(())
}
