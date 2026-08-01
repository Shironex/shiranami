//! `db:folders:*` — the watched library folders.
//!
//! Four channels, ported from `apps/desktop/src/main/ipc/database/folders.ts`.
//! The smallest namespace, and the one with the most to get quietly wrong:
//!
//! - **No `ORDER BY`.** v1 read the table unordered, so v2 does too. SQLite
//!   returns rows in rowid order for a bare scan, which is insertion order,
//!   which is what the settings list has always shown. Adding an `ORDER BY path`
//!   here would be a visible reordering of an existing user's folder list.
//! - **`last_scanned` is a JavaScript timestamp.** v1 wrote
//!   `new Date().toISOString()` — `2026-08-01T12:34:56.789Z` — while the
//!   `created_at` column defaults to `datetime('now')`, which is
//!   `2026-08-01 12:34:56`. Two formats in one table, and both are already on
//!   disk, so [`crate::repo::clock::ISO_8601_NOW`] reproduces the first exactly
//!   rather than tidying it.
//!
//! Invalidating the folders cache is the caller's job: the cache lives in
//! `shiranami-core` and this crate must not reach past its own boundary to
//! poke it.

use shiranami_core::models::WatchedFolder;
use sqlx::{QueryBuilder, Row, Sqlite, SqliteConnection, sqlite::SqliteRow};
use uuid::Uuid;

use crate::error::Result;
use crate::repo::clock::ISO_8601_NOW;
use crate::repo::conn::failed;

/// Every watched folder, in insertion order.
pub async fn get_all(conn: &mut SqliteConnection) -> Result<Vec<WatchedFolder>> {
    let rows = sqlx::query("SELECT id, path, last_scanned, created_at FROM folders")
        .fetch_all(&mut *conn)
        .await
        .map_err(failed("read the watched folders"))?;

    rows.iter().map(folder).collect()
}

/// Watch a folder, returning the row.
///
/// `path` is `UNIQUE`, and unlike `db:tracks:add` v1 did *not* soften the
/// conflict here — adding a folder twice is a user action with a visible
/// outcome, not a background race, so the constraint error stands.
pub async fn add(conn: &mut SqliteConnection, path: &str) -> Result<Option<WatchedFolder>> {
    let row = sqlx::query(
        "INSERT INTO folders (id, path) VALUES (?1, ?2) \
         RETURNING id, path, last_scanned, created_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(path)
    .fetch_optional(&mut *conn)
    .await
    .map_err(failed("add the watched folder"))?;

    row.as_ref().map(folder).transpose()
}

/// Stop watching a folder. Tracks already imported from it are left alone.
pub async fn remove(conn: &mut SqliteConnection, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM folders WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(failed("remove the watched folder"))?;

    Ok(())
}

/// Stamp a folder as scanned just now, returning the row.
pub async fn update_scanned(
    conn: &mut SqliteConnection,
    id: &str,
) -> Result<Option<WatchedFolder>> {
    // Assembled rather than formatted into a literal so that no code path in
    // this module can put a `String` where SQL text goes: the only non-literal
    // here is the bound id. `ISO_8601_NOW` is a constant in this file.
    let mut builder = QueryBuilder::<Sqlite>::new("UPDATE folders SET last_scanned = ");
    builder.push(ISO_8601_NOW);
    builder.push(" WHERE id = ");
    builder.push_bind(id.to_owned());
    builder.push(" RETURNING id, path, last_scanned, created_at");

    let row = builder
        .build()
        .fetch_optional(&mut *conn)
        .await
        .map_err(failed("record the folder scan"))?;

    row.as_ref().map(folder).transpose()
}

/// Map one `folders` row into the wire model.
fn folder(row: &SqliteRow) -> Result<WatchedFolder> {
    read(row).map_err(failed("read a watched-folder row"))
}

/// The column-by-column mapping, kept separate so the error is named once.
fn read(row: &SqliteRow) -> sqlx::Result<WatchedFolder> {
    Ok(WatchedFolder {
        id: row.try_get("id")?,
        path: row.try_get("path")?,
        last_scanned: row.try_get("last_scanned")?,
        created_at: row.try_get("created_at")?,
    })
}
