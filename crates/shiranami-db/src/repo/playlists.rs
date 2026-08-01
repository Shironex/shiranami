//! `db:playlists:*` — the playlist rows themselves.
//!
//! Six of the namespace's thirteen channels. The other seven operate on
//! membership and live in [`crate::repo::playlist_tracks`]; the split follows
//! the two tables, so each file's queries touch one of them.
//!
//! Ported from `apps/desktop/src/main/ipc/database/playlists.ts`.

use shiranami_core::models::{
    Playlist, PlaylistCreateInput, PlaylistCreateWithTracksInput, PlaylistUpdateInput,
};
use sqlx::{Connection, QueryBuilder, Row, Sqlite, SqlitePool, sqlite::SqliteRow};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::clock::ISO_8601_NOW;
use crate::repo::conn::{acquire, failed};
use crate::repo::playlist_tracks;

/// The `SELECT` list for every read that returns whole playlists.
const PLAYLIST_SELECT: &str =
    "SELECT id, name, description, cover_art, created_at, updated_at FROM playlists";

/// What an `INSERT … RETURNING` gives back, matching [`PLAYLIST_SELECT`].
const RETURNING_PLAYLIST: &str =
    " RETURNING id, name, description, cover_art, created_at, updated_at";

/// Every playlist, newest first.
///
/// No tie-break, unlike the library reads — v1 ordered on `created_at` alone
/// here. Playlists are created one user action at a time, so the collision that
/// makes [`crate::repo::track_row::LIBRARY_ORDER`] necessary does not arise.
pub async fn get_all(pool: &SqlitePool) -> Result<Vec<Playlist>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(PLAYLIST_SELECT);
    builder.push(" ORDER BY created_at DESC");

    let rows = builder
        .build()
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the playlists"))?;

    rows.iter().map(playlist).collect()
}

/// One playlist by id.
pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Playlist>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(PLAYLIST_SELECT);
    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("read the playlist"))?;

    row.as_ref().map(playlist).transpose()
}

/// Create an empty playlist.
pub async fn create(pool: &SqlitePool, input: &PlaylistCreateInput) -> Result<Option<Playlist>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new(
        "INSERT INTO playlists (id, name, description, cover_art) VALUES (",
    );
    let mut values = builder.separated(", ");
    values.push_bind(Uuid::new_v4().to_string());
    values.push_bind(input.name.clone());
    values.push_bind(input.description.clone());
    values.push_bind(input.cover_art.clone());
    builder.push(")");
    builder.push(RETURNING_PLAYLIST);

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("create the playlist"))?;

    row.as_ref().map(playlist).transpose()
}

/// Create a playlist and seed its membership, in one transaction.
///
/// Positions follow the input order. The list is *not* de-duplicated: a repeat
/// violates `UNIQUE(playlist_id, track_id)` and rolls the whole thing back,
/// which is what v1 did — unlike
/// [`playlist_tracks::add_tracks`], whose job is to be idempotent.
///
/// `cover_art` is left `NULL`: the create-with-tracks payload has no field for
/// it.
pub async fn create_with_tracks(
    pool: &SqlitePool,
    input: &PlaylistCreateWithTracksInput,
) -> Result<Option<Playlist>> {
    let mut conn = acquire(pool).await?;
    let mut tx = conn
        .begin()
        .await
        .map_err(failed("begin creating the playlist"))?;

    let id = Uuid::new_v4().to_string();

    let mut builder =
        QueryBuilder::<Sqlite>::new("INSERT INTO playlists (id, name, description) VALUES (");
    let mut values = builder.separated(", ");
    values.push_bind(id.clone());
    values.push_bind(input.name.clone());
    values.push_bind(input.description.clone());
    builder.push(")");
    builder.push(RETURNING_PLAYLIST);

    let row = builder
        .build()
        .fetch_optional(&mut *tx)
        .await
        .map_err(failed("create the playlist"))?;

    playlist_tracks::insert_membership(&mut tx, &id, &input.track_ids, 0).await?;

    tx.commit().await.map_err(failed("create the playlist"))?;

    row.as_ref().map(playlist).transpose()
}

/// Apply a patch to a playlist and return the row.
///
/// `updated_at` is always written, so — unlike the track patch — the `SET`
/// clause is never empty and an all-absent patch is still a real statement that
/// only bumps the timestamp. That is v1's behaviour, spread operator included.
pub async fn update(
    pool: &SqlitePool,
    id: &str,
    patch: &PlaylistUpdateInput,
) -> Result<Option<Playlist>> {
    let mut conn = acquire(pool).await?;

    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE playlists SET ");
    let mut set = builder.separated(", ");

    for (column, value) in [
        ("name = ", &patch.name),
        ("description = ", &patch.description),
        ("cover_art = ", &patch.cover_art),
    ] {
        if let Some(text) = value {
            set.push(column);
            set.push_bind_unseparated(text.clone());
        }
    }

    set.push("updated_at = ");
    set.push_unseparated(ISO_8601_NOW);

    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());
    builder.push(RETURNING_PLAYLIST);

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("update the playlist"))?;

    row.as_ref().map(playlist).transpose()
}

/// Delete a playlist. Membership cascades; the tracks themselves are untouched.
pub async fn delete(pool: &SqlitePool, id: &str) -> Result<()> {
    let mut conn = acquire(pool).await?;

    sqlx::query("DELETE FROM playlists WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("delete the playlist"))?;

    Ok(())
}

/// Map one `playlists` row into the wire model.
fn playlist(row: &SqliteRow) -> Result<Playlist> {
    read(row).map_err(failed("read a playlist row"))
}

/// The column-by-column mapping, kept separate so the error is named once.
fn read(row: &SqliteRow) -> sqlx::Result<Playlist> {
    Ok(Playlist {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        cover_art: row.try_get("cover_art")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
