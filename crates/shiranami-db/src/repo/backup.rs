//! Export and import, as far as SQLite is concerned.
//!
//! Ported from the database half of
//! `apps/desktop/src/main/services/db-backup.ts` and
//! `apps/desktop/src/main/ipc/database/backup.ts`. **Only the database half.**
//! Choosing a path with a file dialog, rotating the five launch snapshots,
//! copying to a temp file and renaming it into place, unlinking stale
//! `-wal`/`-shm` sidecars, and closing and reopening the live pool are file
//! orchestration and belong to the layer above; nothing here touches a path it
//! was not handed, and nothing here deletes anything.
//!
//! What is left is three operations, and the order the caller must use them in
//! is the whole safety property:
//!
//! 1. [`is_sqlite_file`] — cheap header probe.
//! 2. [`assert_importable`] — the same probe plus the downgrade guard.
//! 3. [`snapshot_to`] — write a consistent copy.
//!
//! # The import guard runs before the overwrite, never after
//!
//! v1 learned this the explicit way, and its comment says so: if the
//! `user_version` check happened after the file swap, a user importing a
//! newer-schema backup would have their working library destroyed *and then* be
//! told the import was refused. [`assert_importable`] reads the candidate file
//! and only the candidate file, opening it **read-only** so a validation pass
//! cannot itself modify the backup the user is about to depend on.
//!
//! An unstamped or legacy backup reads `0`, which passes the guard and is then
//! baselined by [`crate::adopt`] when the imported file is opened. That is
//! intended: `0` means "older than versioning", not "unknown".
//!
//! # `VACUUM INTO` instead of the online backup API
//!
//! v1 used better-sqlite3's `.backup()`, which wraps `sqlite3_backup_step`.
//! sqlx exposes no equivalent, so [`snapshot_to`] uses `VACUUM INTO`, SQLite's
//! own single-statement snapshot. Both produce a transactionally consistent
//! copy from a WAL database without an explicit checkpoint, which is the
//! property the feature needs. Two differences worth knowing:
//!
//! - `VACUUM INTO` **defragments**, so the copy is usually smaller than the
//!   source rather than page-for-page identical. For an export the user is
//!   about to keep, smaller is not a regression.
//! - `VACUUM INTO` **refuses an existing destination** where `.backup()`
//!   overwrote one. The caller owns the "the user picked a file that already
//!   exists" case, which it has to own anyway to show the overwrite prompt.
//!
//! `VACUUM` also cannot run inside a transaction — call [`snapshot_to`] on a
//! connection with none open.

use std::io::Read;
use std::path::Path;

use sqlx::ConnectOptions;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};

use crate::compat::{SCHEMA_FLOOR, assert_not_downgrade};
use crate::error::{DbError, Result};

/// The first 16 bytes of every SQLite database file.
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Whether the file at `path` begins with the SQLite header.
///
/// Every failure — missing file, unreadable file, a file shorter than the
/// header — is `false` rather than an error, exactly as v1's `try/catch`
/// returned `false`. The question being asked is "can this plausibly be a
/// database", and every one of those answers is "no".
///
/// A header check is not a validity check: it rejects the common mistake of
/// picking a `.zip` or a text file, and it is deliberately cheap. Real damage
/// is caught by `quick_check` when the imported file is opened.
#[must_use]
pub fn is_sqlite_file(path: &Path) -> bool {
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };

    let mut header = [0_u8; SQLITE_MAGIC.len()];
    file.read_exact(&mut header).is_ok() && &header == SQLITE_MAGIC
}

/// Refuse a candidate backup this build must not import.
///
/// Call **before** overwriting the live database — see the module docs.
///
/// # Errors
///
/// - [`DbError::NotADatabase`] if the file does not begin with the SQLite
///   header.
/// - [`DbError::SchemaTooNew`] if it was stamped by a newer build.
/// - [`DbError::Query`] if the file has the right header but cannot be opened
///   or read.
pub async fn assert_importable(path: &Path) -> Result<()> {
    if !is_sqlite_file(path) {
        return Err(DbError::NotADatabase {
            path: path.display().to_string(),
        });
    }

    let found = read_user_version(path).await?;
    assert_not_downgrade(found, SCHEMA_FLOOR)
}

/// Read `PRAGMA user_version` from a database file that is not the live one.
///
/// Opens its own read-only connection rather than borrowing the pool's, which
/// is not the second-connection hazard [`super`] warns about: that rule is
/// about contending for the single pooled connection to the *live* database,
/// and this opens a different file entirely. Read-only, `create_if_missing`
/// off, and no journal-mode pragma — a probe must not create, upgrade, or
/// otherwise write to the user's backup.
async fn read_user_version(path: &Path) -> Result<i64> {
    let mut conn = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false)
        .connect()
        .await
        .map_err(|source| DbError::Query {
            operation: "open the backup to check its schema version",
            source,
        })?;

    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "read the backup's schema version",
            source,
        })?;

    // Best-effort: the version has already been read, and a failure to hang up
    // politely is not a reason to refuse an otherwise valid import.
    let _ = conn.close().await;

    Ok(version)
}

/// Write a consistent copy of the connected database to `dest`.
///
/// `dest` must not already exist, and no transaction may be open — see the
/// module docs.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails, which includes the
/// destination already existing and the destination directory not being
/// writable.
pub async fn snapshot_to(conn: &mut SqliteConnection, dest: &Path) -> Result<()> {
    // `VACUUM INTO` takes an expression, so the path is a bound parameter and
    // never formatted into the statement. This matters more than usual: the
    // path comes from a file dialog, which is to say from the user.
    sqlx::query("VACUUM INTO ?1")
        .bind(dest.display().to_string())
        .execute(conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "write the database snapshot",
            source,
        })?;

    Ok(())
}
