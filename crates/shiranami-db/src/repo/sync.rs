//! LAN sync v0: paired devices, the desktop's sync identity, and the read-only
//! snapshot queries the phone pulls (migration `0010`).
//!
//! Everything a phone sees passes through here, and everything here is a read
//! except the peer rows and the two identity values. The snapshot reads page by
//! `rowid` (keyset, never `OFFSET`), so a 10k-track library is served in
//! constant-cost pages and a page boundary is stable while the user keeps
//! listening: an insert lands past the last rowid, never inside a page already
//! sent.
//!
//! The rowid is an implementation detail of the cursor. `shiranami-sync` turns
//! it into an opaque string before it reaches the wire, so a later op-log
//! cursor (v1) or a server sequence (v2) can replace it without a client
//! change.

use std::path::Path;

use shiranami_core::models::Track;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::{ConnectOptions as _, Connection as _, Row as _, SqliteConnection};

use crate::error::Result;
use crate::repo::clock::ISO_8601_NOW;
use crate::repo::conn::failed;
use crate::repo::track_row;

/// A paired device, as stored. `secret` is the HMAC key and never leaves the
/// sync crate; the desktop UI gets [`SyncPeer`] without it via its own type.
#[derive(Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct SyncPeer {
    /// Desktop-minted UUID, the `dev=` of every signed request.
    pub device_id: String,
    /// What the phone called itself at pairing ("Pixel 8").
    pub name: String,
    /// The phone's platform string (`android`, `ios`).
    pub platform: String,
    /// Base64url HMAC key. A credential.
    pub secret: String,
    /// When the pairing was allowed, ISO-8601.
    pub created_at: String,
    /// Last authenticated request, ISO-8601.
    pub last_seen_at: Option<String>,
}

impl std::fmt::Debug for SyncPeer {
    /// Redacted: a peer in a log line must not carry its key.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SyncPeer")
            .field("device_id", &self.device_id)
            .field("platform", &self.platform)
            .field("secret", &"<redacted>")
            .finish_non_exhaustive()
    }
}

/// One manifest row: the track, its content hash and its keyset position.
#[derive(Debug, Clone, PartialEq)]
pub struct ManifestRow {
    /// The `rowid` the next page starts after.
    pub rowid: i64,
    /// The track as the rest of the app reads it.
    pub track: Track,
    /// `"<scheme>:<sha256>"` from migration `0009`, `NULL` until hashed.
    pub content_hash: Option<String>,
}

/// A playlist with its ordered track ids.
#[derive(Debug, Clone, PartialEq)]
pub struct PlaylistSnapshot {
    /// Playlist UUID.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Optional description.
    pub description: Option<String>,
    /// Stored cover-art value, canonical `shiranami-art://art/<name>` form.
    pub cover_art: Option<String>,
    /// SQLite `datetime('now')` spelling, as written.
    pub created_at: String,
    /// SQLite `datetime('now')` spelling, as written.
    pub updated_at: String,
    /// Track ids in playlist order.
    pub track_ids: Vec<String>,
}

/// One play-history row with its keyset position.
#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct HistoryRow {
    /// The `rowid` the next page starts after.
    pub rowid: i64,
    /// Row UUID.
    pub id: String,
    /// The track played.
    pub track_id: String,
    /// When, as stored.
    pub played_at: String,
    /// Seconds actually heard.
    pub played_seconds: f64,
    /// Fraction of the track heard.
    pub completion_ratio: f64,
    /// Whether the play counted as complete.
    pub completed: bool,
    /// Where playback started (`library`, `playlist`, ...).
    pub source: String,
}

/// Store a newly allowed device.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the insert fails, including a duplicate id.
pub async fn insert_peer(conn: &mut SqliteConnection, peer: &SyncPeer) -> Result<()> {
    sqlx::query(
        "INSERT INTO sync_peers (device_id, name, platform, secret, created_at, last_seen_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(&peer.device_id)
    .bind(&peer.name)
    .bind(&peer.platform)
    .bind(&peer.secret)
    .bind(&peer.created_at)
    .bind(&peer.last_seen_at)
    .execute(conn)
    .await
    .map_err(failed("store a paired device"))?;
    Ok(())
}

/// One device by id.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails.
pub async fn get_peer(conn: &mut SqliteConnection, device_id: &str) -> Result<Option<SyncPeer>> {
    sqlx::query_as::<_, SyncPeer>(
        "SELECT device_id, name, platform, secret, created_at, last_seen_at \
           FROM sync_peers WHERE device_id = ?1",
    )
    .bind(device_id)
    .fetch_optional(conn)
    .await
    .map_err(failed("read a paired device"))
}

/// Every paired device, oldest pairing first.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails.
pub async fn list_peers(conn: &mut SqliteConnection) -> Result<Vec<SyncPeer>> {
    sqlx::query_as::<_, SyncPeer>(
        "SELECT device_id, name, platform, secret, created_at, last_seen_at \
           FROM sync_peers ORDER BY created_at ASC, rowid ASC",
    )
    .fetch_all(conn)
    .await
    .map_err(failed("read the paired devices"))
}

/// Revoke a device. Returns whether a row was deleted.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the delete fails.
pub async fn delete_peer(conn: &mut SqliteConnection, device_id: &str) -> Result<bool> {
    let done = sqlx::query("DELETE FROM sync_peers WHERE device_id = ?1")
        .bind(device_id)
        .execute(conn)
        .await
        .map_err(failed("revoke a paired device"))?;
    Ok(done.rows_affected() > 0)
}

/// Stamp `last_seen_at` with now.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the update fails.
pub async fn touch_peer(conn: &mut SqliteConnection, device_id: &str) -> Result<()> {
    // `ISO_8601_NOW` is a `&'static str` SQL fragment, never a value.
    let sql = format!("UPDATE sync_peers SET last_seen_at = {ISO_8601_NOW} WHERE device_id = ?1");
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(device_id)
        .execute(conn)
        .await
        .map_err(failed("stamp a paired device as seen"))?;
    Ok(())
}

/// Read `key` from `sync_meta`, storing `candidate` first if it is absent.
///
/// Idempotent and race-free on the single connection: the first caller's
/// candidate wins and every later call reads it back.
///
/// # Errors
///
/// [`crate::DbError::Query`] if either statement fails.
pub async fn meta_get_or_insert(
    conn: &mut SqliteConnection,
    key: &str,
    candidate: &str,
) -> Result<String> {
    sqlx::query("INSERT OR IGNORE INTO sync_meta (key, value) VALUES (?1, ?2)")
        .bind(key)
        .bind(candidate)
        .execute(&mut *conn)
        .await
        .map_err(failed("mint a sync identity value"))?;
    sqlx::query_scalar("SELECT value FROM sync_meta WHERE key = ?1")
        .bind(key)
        .fetch_one(conn)
        .await
        .map_err(failed("read a sync identity value"))
}

/// How many tracks the library holds.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails.
pub async fn track_count(conn: &mut SqliteConnection) -> Result<i64> {
    sqlx::query_scalar("SELECT COUNT(*) FROM tracks")
        .fetch_one(conn)
        .await
        .map_err(failed("count the library"))
}

/// One manifest page: up to `limit` tracks with `rowid > after`, in rowid order.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails or a row will not decode.
pub async fn manifest_page(
    conn: &mut SqliteConnection,
    after: i64,
    limit: i64,
) -> Result<Vec<ManifestRow>> {
    let rows = sqlx::query(
        "SELECT tracks.rowid AS sync_rowid, tracks.* FROM tracks \
          WHERE tracks.rowid > ?1 ORDER BY tracks.rowid ASC LIMIT ?2",
    )
    .bind(after)
    .bind(limit)
    .fetch_all(conn)
    .await
    .map_err(failed("read a sync manifest page"))?;

    rows.iter()
        .map(|row| {
            Ok(ManifestRow {
                rowid: row
                    .try_get("sync_rowid")
                    .map_err(failed("read a manifest rowid"))?,
                track: track_row::track(row)?,
                content_hash: row
                    .try_get("content_hash")
                    .map_err(failed("read a manifest content hash"))?,
            })
        })
        .collect()
}

/// The stored file path and title of a track, for the audio route. `None` for
/// an unknown id.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails.
pub async fn track_file(conn: &mut SqliteConnection, id: &str) -> Result<Option<(String, String)>> {
    sqlx::query_as("SELECT file_path, title FROM tracks WHERE id = ?1")
        .bind(id)
        .fetch_optional(conn)
        .await
        .map_err(failed("resolve a track for sync"))
}

/// Every playlist with its ordered track ids, newest first like the sidebar.
///
/// Two queries, not one per playlist: the membership read is a single scan of
/// the `(playlist_id, position)` index.
///
/// # Errors
///
/// [`crate::DbError::Query`] if either read fails.
pub async fn playlists_snapshot(conn: &mut SqliteConnection) -> Result<Vec<PlaylistSnapshot>> {
    let heads = sqlx::query(
        "SELECT id, name, description, cover_art, created_at, updated_at \
           FROM playlists ORDER BY created_at DESC, rowid ASC",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(failed("read the playlists for sync"))?;

    let entries: Vec<(String, String)> = sqlx::query_as(
        "SELECT playlist_id, track_id FROM playlist_tracks ORDER BY playlist_id, position",
    )
    .fetch_all(conn)
    .await
    .map_err(failed("read the playlist entries for sync"))?;

    let mut by_playlist: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for (playlist_id, track_id) in entries {
        by_playlist.entry(playlist_id).or_default().push(track_id);
    }

    heads
        .iter()
        .map(|row| {
            let id: String = row.try_get("id").map_err(failed("read a playlist id"))?;
            Ok(PlaylistSnapshot {
                track_ids: by_playlist.remove(&id).unwrap_or_default(),
                id,
                name: row
                    .try_get("name")
                    .map_err(failed("read a playlist name"))?,
                description: row
                    .try_get("description")
                    .map_err(failed("read a playlist description"))?,
                cover_art: row
                    .try_get("cover_art")
                    .map_err(failed("read a playlist cover"))?,
                created_at: row
                    .try_get("created_at")
                    .map_err(failed("read a playlist timestamp"))?,
                updated_at: row
                    .try_get("updated_at")
                    .map_err(failed("read a playlist timestamp"))?,
            })
        })
        .collect()
}

/// Ids of every favourite track, in library insertion order.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails.
pub async fn favorite_ids(conn: &mut SqliteConnection) -> Result<Vec<String>> {
    sqlx::query_scalar("SELECT id FROM tracks WHERE is_favorite = 1 ORDER BY rowid ASC")
        .fetch_all(conn)
        .await
        .map_err(failed("read the favourites for sync"))
}

/// One history page: up to `limit` plays with `rowid > after`, oldest first.
///
/// # Errors
///
/// [`crate::DbError::Query`] if the read fails.
pub async fn history_page(
    conn: &mut SqliteConnection,
    after: i64,
    limit: i64,
) -> Result<Vec<HistoryRow>> {
    sqlx::query_as::<_, HistoryRow>(
        "SELECT rowid, id, track_id, played_at, played_seconds, completion_ratio, completed, \
                source \
           FROM play_history WHERE rowid > ?1 ORDER BY rowid ASC LIMIT ?2",
    )
    .bind(after)
    .bind(limit)
    .fetch_all(conn)
    .await
    .map_err(failed("read a sync history page"))
}

/// Delete every paired-device secret from the database file at `path`.
///
/// Runs on an exported copy (so a backup the user shares is not a sync
/// credential) and on a staged import (so a backup can never add a paired
/// device). Never on the live file. A file without the table (an export from
/// before migration `0010`) has nothing to strip.
///
/// An imported file is attacker-controlled, so the schema is checked before
/// the delete and the result after it:
///
/// - `sync_peers` must be absent or a plain table. A view or a virtual table
///   of that name is refused: migration `0010` uses `IF NOT EXISTS` and would
///   leave it in place.
/// - Every trigger whose SQL names `sync_peers` is dropped. That covers an
///   `AFTER DELETE` trigger that re-inserts the rows and a trigger on another
///   table that writes into `sync_peers` later. The app's own triggers (the
///   FTS sync in `0004`) never mention it, so they are kept.
/// - After the delete and `VACUUM`, the table must be empty.
///
/// The delete runs with `secure_delete` on and is followed by `VACUUM`, so
/// the removed ids and secrets do not survive in free pages. Opens the file in
/// rollback-journal mode so no `-wal` sibling is left next to it.
///
/// # Errors
///
/// [`crate::DbError::UnsafeBackup`] for a crafted schema or rows that
/// survived, [`crate::DbError::Query`] if the file cannot be opened or a
/// statement fails.
pub async fn strip_credentials(path: &Path) -> Result<()> {
    let mut conn = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .journal_mode(SqliteJournalMode::Delete)
        .connect()
        .await
        .map_err(failed("open the database copy"))?;

    let result = strip_on(&mut conn).await;
    let closed = conn
        .close()
        .await
        .map_err(failed("close the database copy"));
    result.and(closed)
}

async fn strip_on(conn: &mut sqlx::SqliteConnection) -> Result<()> {
    let objects: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT type, sql FROM sqlite_master WHERE lower(name) = 'sync_peers'")
            .fetch_all(&mut *conn)
            .await
            .map_err(failed("inspect the database copy"))?;
    let mut has_table = false;
    for (kind, sql) in &objects {
        let plain_table = kind == "table"
            && sql.as_deref().is_some_and(|sql| {
                sql.trim_start()
                    .get(..12)
                    .is_some_and(|head| head.eq_ignore_ascii_case("CREATE TABLE"))
            });
        if !plain_table {
            return Err(crate::DbError::UnsafeBackup {
                reason: "sync_peers is not a plain table",
            });
        }
        has_table = true;
    }

    let triggers: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' \
         AND lower(sql) LIKE '%sync_peers%'",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(failed("list triggers in the database copy"))?;
    for name in triggers {
        let drop = format!("DROP TRIGGER IF EXISTS \"{}\"", name.replace('"', "\"\""));
        sqlx::query(sqlx::AssertSqlSafe(drop))
            .execute(&mut *conn)
            .await
            .map_err(failed("drop a trigger from the database copy"))?;
    }

    if !has_table {
        return Ok(());
    }
    // A plain DELETE only unlinks the rows: the bundled SQLite leaves
    // `secure_delete` off, so the ids and secrets would survive in free
    // pages. Zero them on delete, then VACUUM to rebuild the file without any
    // free page at all.
    sqlx::query("PRAGMA secure_delete = ON")
        .execute(&mut *conn)
        .await
        .map_err(failed("enable secure delete on the copy"))?;
    sqlx::query("DELETE FROM sync_peers")
        .execute(&mut *conn)
        .await
        .map_err(failed("strip sync credentials from the copy"))?;
    sqlx::query("VACUUM")
        .execute(&mut *conn)
        .await
        .map_err(failed("compact the copy"))?;
    let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_peers")
        .fetch_one(&mut *conn)
        .await
        .map_err(failed("count what is left in the copy"))?;
    if left != 0 {
        return Err(crate::DbError::UnsafeBackup {
            reason: "paired devices survived the strip",
        });
    }
    Ok(())
}
