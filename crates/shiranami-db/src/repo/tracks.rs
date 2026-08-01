//! `db:tracks:*` — the library itself.
//!
//! Thirteen channels, ported from `apps/desktop/src/main/ipc/database/tracks.ts`.
//! Three properties are load-bearing and are pinned by
//! `tests/repo_tracks.rs` rather than left to review:
//!
//! - **Order.** Every library-wide read is `created_at DESC, rowid ASC`. See
//!   [`track_row::LIBRARY_ORDER`] for why the tie-break is not optional.
//! - **Idempotence on `file_path`.** The renderer's import path does a
//!   non-atomic `exists()` → `add()` across two calls, so a racing import must
//!   get the existing row back, not a `UNIQUE` violation.
//! - **Patch semantics.** An absent field leaves its column alone; an explicit
//!   `null` clears it ([`track_patch`]).
//!
//! One thing this module deliberately does *not* do: prune orphaned album art
//! after `remove_many`. v1 fired that off the critical path from inside the
//! handler; in v2 the art cache belongs to `shiranami-metadata`, which sits
//! beside this crate on the dependency spine rather than below it. The caller
//! sequences the two.

use std::collections::HashMap;

use shiranami_core::models::{Track, TrackCreateInput, TrackUpdateInput};
use sqlx::{Connection, QueryBuilder, Sqlite, SqliteConnection, SqlitePool};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::conn::{acquire, failed};
use crate::repo::track_patch;
use crate::repo::track_row::{self, LIBRARY_ORDER, TRACK_SELECT};

/// Rows per `INSERT`, as v1 sized it.
///
/// Twelve columns per track, so a full chunk binds 1,200 parameters — an order
/// of magnitude under SQLite's 32,766 `SQLITE_MAX_VARIABLE_NUMBER`.
const INSERT_CHUNK: usize = 100;

/// Ids per `IN (…)` list, as v1 sized it. One bind each.
const ID_CHUNK: usize = 500;

/// The insert column list, and the order [`push_values`] binds in.
const INSERT_INTO: &str = "INSERT INTO tracks \
    (id, file_path, title, artist, album_artist, album, duration, genre, year, \
     track_number, disc_number, album_art) ";

/// Every track, newest first.
pub async fn get_all(pool: &SqlitePool) -> Result<Vec<Track>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    builder.push(LIBRARY_ORDER);

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the library"))?;

    track_row::tracks(&rows)
}

/// Insert one track, or hand back the row that already holds its `file_path`.
///
/// `file_path` is `UNIQUE` and the renderer's import is a non-atomic
/// `exists()` → `add()` across two calls, so the loser of that race must not
/// see a constraint error. `ON CONFLICT DO NOTHING` plus the fallback read
/// makes the channel idempotent, which is the contract the preload API
/// documents ("an already-imported file returns its existing row").
pub async fn add(pool: &SqlitePool, input: &TrackCreateInput) -> Result<Option<Track>> {
    let mut conn = acquire(pool).await?;

    let inserted = insert_chunk(&mut conn, std::slice::from_ref(input)).await?;
    if let Some(track) = inserted.into_iter().next() {
        return Ok(Some(track));
    }

    let existing = sqlx::query("SELECT tracks.* FROM tracks WHERE tracks.file_path = ?1")
        .bind(&input.file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the track that already holds this path"))?;

    existing.as_ref().map(track_row::track).transpose()
}

/// Insert many tracks in one transaction, returning only the rows that landed.
///
/// Duplicates are skipped rather than echoed — the preload contract's wording,
/// and what the scan path depends on: the returned rows are exactly the ones to
/// add to the in-memory library, since the already-present ones are already
/// there.
pub async fn add_many(pool: &SqlitePool, incoming: &[TrackCreateInput]) -> Result<Vec<Track>> {
    if incoming.is_empty() {
        return Ok(Vec::new());
    }

    let mut conn = acquire(pool).await?;
    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin the track import"))?;

    let mut inserted = Vec::with_capacity(incoming.len());
    for chunk in incoming.chunks(INSERT_CHUNK) {
        inserted.extend(insert_chunk(&mut tx, chunk).await?);
    }

    tx.commit().await.map_err(failed("import the tracks"))?;

    Ok(inserted)
}

/// Delete one track. Cascades to playlist membership and play history.
pub async fn remove(pool: &SqlitePool, id: &str) -> Result<()> {
    let mut conn = acquire(pool).await?;

    sqlx::query("DELETE FROM tracks WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("remove the track"))?;

    Ok(())
}

/// Delete many tracks in one transaction, in chunks.
pub async fn remove_many(pool: &SqlitePool, ids: &[String]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }

    let mut conn = acquire(pool).await?;
    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin removing the tracks"))?;

    for chunk in ids.chunks(ID_CHUNK) {
        let mut builder = QueryBuilder::<Sqlite>::new("DELETE FROM tracks WHERE id IN (");
        push_ids(&mut builder, chunk);
        builder.push(")");

        builder
            .build()
            .execute(&mut *tx)
            .await
            .map_err(failed("remove the tracks"))?;
    }

    tx.commit().await.map_err(failed("remove the tracks"))?;

    Ok(())
}

/// Apply a patch to one track and return the row as it now stands.
///
/// An all-absent patch is a no-op that still returns the row: `SET` with no
/// assignments is a syntax error, and refusing the call would be a worse
/// contract than "you asked for no changes, here is the unchanged track".
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    patch: &TrackUpdateInput,
) -> Result<Option<Track>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE tracks SET ");
    if track_patch::push_assignments(&mut builder, patch) == 0 {
        let row = sqlx::query("SELECT tracks.* FROM tracks WHERE tracks.id = ?1")
            .bind(id)
            .fetch_optional(&mut *conn)
            .await
            .map_err(failed("read the track"))?;

        return row.as_ref().map(track_row::track).transpose();
    }

    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());
    builder.push(" RETURNING *");

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("update the track"))?;

    row.as_ref().map(track_row::track).transpose()
}

/// Apply many patches in one transaction, grouping identical ones.
///
/// The sole caller (metadata-enrich apply) re-reads the library afterwards, so
/// nothing is returned and the per-row `RETURNING` round-trips v1 dropped stay
/// dropped. Patches repeat heavily — a whole album getting the same
/// album/artist/year fix — so equal patches collapse into one `IN (…)` update
/// each ([`track_patch::grouping_key`]). Patches that say nothing are skipped
/// rather than turned into an empty `SET`.
pub async fn update_many(pool: &SqlitePool, updates: &[(String, TrackUpdateInput)]) -> Result<()> {
    if updates.is_empty() {
        return Ok(());
    }

    let groups = group_by_patch(updates);
    if groups.is_empty() {
        return Ok(());
    }

    let mut conn = acquire(pool).await?;
    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin updating the tracks"))?;

    for (patch, ids) in &groups {
        for chunk in ids.chunks(ID_CHUNK) {
            let mut builder = QueryBuilder::<Sqlite>::new("UPDATE tracks SET ");
            if track_patch::push_assignments(&mut builder, patch) == 0 {
                continue;
            }
            builder.push(" WHERE id IN (");
            push_ids(&mut builder, chunk);
            builder.push(")");

            builder
                .build()
                .execute(&mut *tx)
                .await
                .map_err(failed("update the tracks"))?;
        }
    }

    tx.commit().await.map_err(failed("update the tracks"))?;

    Ok(())
}

/// Flip one track's favourite flag and return the row.
///
/// `NOT NULL` is `NULL` in SQLite, so a row whose `is_favorite` was never set
/// stays `NULL` here — exactly as v1's `sql`NOT ${tracks.isFavorite}`` did. The
/// column has a `false` default, so only a row written around it can be in that
/// state.
pub async fn toggle_favorite(pool: &SqlitePool, id: &str) -> Result<Option<Track>> {
    updated_row(
        pool,
        "UPDATE tracks SET is_favorite = NOT is_favorite WHERE id = ?1 RETURNING *",
        id,
        "toggle the track's favourite flag",
    )
    .await
}

/// Every favourited track, newest first.
pub async fn get_favorites(pool: &SqlitePool) -> Result<Vec<Track>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(TRACK_SELECT);
    builder.push(" WHERE tracks.is_favorite = ");
    builder.push_bind(true);
    builder.push(LIBRARY_ORDER);

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the favourite tracks"))?;

    track_row::tracks(&rows)
}

/// Add one to a track's play count and return the row.
pub async fn increment_play_count(pool: &SqlitePool, id: &str) -> Result<Option<Track>> {
    updated_row(
        pool,
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?1 RETURNING *",
        id,
        "increment the track's play count",
    )
    .await
}

/// Whether the library already holds a track for this file.
pub async fn exists(pool: &SqlitePool, file_path: &str) -> Result<bool> {
    let mut conn = acquire(pool).await?;

    let found: Option<String> = sqlx::query_scalar("SELECT id FROM tracks WHERE file_path = ?1")
        .bind(file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("look up the track by path"))?;

    Ok(found.is_some())
}

/// Which of these paths the library already holds, deduplicated.
///
/// Order follows first appearance in the database reads, matching the `Set`
/// insertion order v1 spread into an array.
pub async fn exists_many(pool: &SqlitePool, file_paths: &[String]) -> Result<Vec<String>> {
    if file_paths.is_empty() {
        return Ok(Vec::new());
    }

    let mut conn = acquire(pool).await?;
    let mut existing = Vec::new();

    for chunk in file_paths.chunks(ID_CHUNK) {
        let mut builder =
            QueryBuilder::<Sqlite>::new("SELECT file_path FROM tracks WHERE file_path IN (");
        push_ids(&mut builder, chunk);
        builder.push(")");

        let found: Vec<String> = builder
            .build_query_scalar()
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("look up the tracks by path"))?;

        for path in found {
            if !existing.contains(&path) {
                existing.push(path);
            }
        }
    }

    Ok(existing)
}

/// The id of the track holding this file, if any.
pub async fn get_id_by_path(pool: &SqlitePool, file_path: &str) -> Result<Option<String>> {
    let mut conn = acquire(pool).await?;

    sqlx::query_scalar("SELECT id FROM tracks WHERE file_path = ?1")
        .bind(file_path)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("look up the track id by path"))
}

/// Run a single-row `UPDATE … RETURNING *` keyed on `id`.
///
/// Shared by the two counter-style channels, whose only difference is the `SET`
/// expression. `statement` is always a literal from this module.
async fn updated_row(
    pool: &SqlitePool,
    statement: &'static str,
    id: &str,
    operation: &'static str,
) -> Result<Option<Track>> {
    let mut conn = acquire(pool).await?;

    let row = sqlx::query(statement)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed(operation))?;

    row.as_ref().map(track_row::track).transpose()
}

/// Insert up to [`INSERT_CHUNK`] tracks, returning the rows that landed.
///
/// Takes a connection rather than the pool because both callers already hold
/// one — `add_many` is mid-transaction on it.
///
/// Every column the create payload can speak about is listed and bound, so a
/// `None` writes `NULL` rather than falling to the column default. That is the
/// one place the port cannot mirror v1 exactly: drizzle distinguished an absent
/// key (take the default, e.g. `'Unknown Artist'`) from an explicit `null`, and
/// [`TrackCreateInput`] has no absent state to carry the difference. Binding
/// `NULL` is the branch the real callers take — v1's scan path sends every key,
/// with `?? null` for the untagged ones, and its `artist`/`album` are collapsed
/// to non-null strings before they get here (`TrackMetadata`), so the defaults
/// were already unreachable through the IPC surface.
async fn insert_chunk(
    conn: &mut SqliteConnection,
    chunk: &[TrackCreateInput],
) -> Result<Vec<Track>> {
    let mut builder = QueryBuilder::<Sqlite>::new(INSERT_INTO);

    builder.push_values(chunk, |mut row, track| {
        row.push_bind(Uuid::new_v4().to_string())
            .push_bind(track.file_path.clone())
            .push_bind(track.title.clone())
            .push_bind(track.artist.clone())
            .push_bind(track.album_artist.clone())
            .push_bind(track.album.clone())
            .push_bind(track.duration)
            .push_bind(track.genre.clone())
            .push_bind(track.year)
            .push_bind(track.track_number)
            .push_bind(track.disc_number)
            .push_bind(track.album_art.clone());
    });

    builder.push(" ON CONFLICT (file_path) DO NOTHING RETURNING *");

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("insert the tracks"))?;

    track_row::tracks(&rows)
}

/// Push a comma-separated list of bound ids, for an `IN (…)`.
fn push_ids(builder: &mut QueryBuilder<Sqlite>, ids: &[String]) {
    let mut list = builder.separated(", ");
    for id in ids {
        list.push_bind(id.clone());
    }
}

/// Collapse `(id, patch)` pairs into one entry per distinct patch.
///
/// Insertion-ordered, like the `Map` v1 built, so the statements run in the
/// order the caller listed them. Patches that say nothing survive grouping and
/// are dropped at the statement, where [`track_patch::push_assignments`] is the
/// one authority on whether a patch is empty.
fn group_by_patch(updates: &[(String, TrackUpdateInput)]) -> Vec<(TrackUpdateInput, Vec<String>)> {
    let mut groups: Vec<(TrackUpdateInput, Vec<String>)> = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();

    for (id, patch) in updates {
        let key = track_patch::grouping_key(patch);
        match seen.get(&key) {
            Some(&index) => groups[index].1.push(id.clone()),
            None => {
                seen.insert(key, groups.len());
                groups.push((patch.clone(), vec![id.clone()]));
            }
        }
    }

    groups
}
