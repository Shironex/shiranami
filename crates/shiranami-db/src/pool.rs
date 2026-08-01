//! The sqlx pool, configured to mirror the connection v1 actually opened.
//!
//! Every pragma here is a match against `packages/database/src/client.ts` plus
//! the better-sqlite3 defaults it inherited, not a value picked for v2. A
//! database is a file two builds have to agree about during the handover
//! window, so "what did v1 do" is the whole specification.
//!
//! | Setting        | v1                                              | v2                |
//! | -------------- | ----------------------------------------------- | ----------------- |
//! | `journal_mode` | `WAL`, set explicitly at init                   | same, explicit    |
//! | `foreign_keys` | `ON`, set explicitly at init                    | same, explicit    |
//! | `busy_timeout` | `5000` ms — better-sqlite3's default `timeout`  | same, explicit    |
//! | `synchronous`  | `FULL` — SQLite's default, v1 never changed it  | same, explicit    |
//! | `quick_check`  | at open, warn only                              | at open, **fail** |
//!
//! The two deliberate divergences, both documented where they happen:
//! `quick_check` is fatal rather than advisory ([`crate::error::DbError`]), and
//! the pool holds exactly one connection ([`MAX_CONNECTIONS`]).

use std::path::Path;
use std::time::Duration;

use sqlx::SqliteConnection;
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};

use crate::error::{DbError, Result};

/// How long SQLite waits on a locked database before returning `SQLITE_BUSY`.
///
/// better-sqlite3's `timeout` option defaults to 5000 ms and v1 never set it,
/// so this is the value every shipped release ran with.
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

/// The pool holds exactly one connection.
///
/// v1's better-sqlite3 handle was synchronous and singular: all 45 database IPC
/// channels queued behind one connection on the Electron main thread. Keeping
/// that shape has a specific payoff beyond fidelity — it removes the
/// `SQLITE_BUSY` class outright. WAL admits one writer, and sqlx's `begin()`
/// opens a *deferred* transaction, so two concurrent writers that each read
/// before writing race to upgrade and the loser gets `SQLITE_BUSY_SNAPSHOT`,
/// which `busy_timeout` explicitly does not retry. One connection cannot lose
/// that race.
///
/// It cannot be slower than what shipped, either: v1 serialised the same work
/// on a thread that also drew the UI, and v2 serialises it off that thread.
///
/// The constraint this imposes on Phase 7: never acquire a second connection
/// while holding one — a nested `pool.acquire()` inside a transaction would
/// deadlock against itself. Raising this number is possible later, but only
/// together with `BEGIN IMMEDIATE` on every write path.
const MAX_CONNECTIONS: u32 = 1;

/// Connection options mirroring v1's, for a database at `path`.
///
/// Exposed because the adoption tests build connections directly, without a
/// pool, and have to do it through the same pragmas the app runs with.
pub fn connect_options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        // better-sqlite3 creates the file when it is missing; a fresh install
        // depends on it.
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true)
        .synchronous(SqliteSynchronous::Full)
        .busy_timeout(BUSY_TIMEOUT)
}

/// Open the pool for the database at `path`, creating the file if absent.
///
/// Applies the pragmas above and nothing else — no migration, no adoption. Use
/// [`crate::open`] for the full boot path; this is the seam underneath it.
pub async fn open_pool(path: &Path) -> Result<SqlitePool> {
    SqlitePoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        // Connect eagerly so a bad path or an unreadable file fails here,
        // where the caller can still show a useful dialog, rather than on the
        // first query somewhere in a command handler.
        .min_connections(MAX_CONNECTIONS)
        // The one connection is the database handle for the process lifetime.
        // Recycling it would buy nothing and lose the WAL read snapshot.
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(connect_options(path))
        .await
        .map_err(|source| classify(source, "open the database"))
}

/// Run SQLite's fast structural check, failing if the file is damaged.
///
/// v1 ran the same pragma and only logged a warning, reasoning that a
/// partially-readable database is still worth opening so the user can export
/// from it. v2's caller is different: this runs on the first-run adoption path,
/// which is about to write a migration ledger into the file. Writing into a
/// damaged database is how something recoverable stops being recoverable, so
/// here it is fatal and the user keeps their file plus an actionable error
/// (architecture §3.1 step 7).
pub async fn quick_check(conn: &mut SqliteConnection) -> Result<()> {
    check_with(conn, "PRAGMA quick_check").await
}

/// Run SQLite's thorough integrity check.
///
/// Separate from [`quick_check`] because it is slow — seconds, on a large
/// database or a slow disk. v1 deferred it off the startup path with
/// `setImmediate` for exactly that reason; v2's boot path should spawn it the
/// same way rather than await it inline.
pub async fn integrity_check(conn: &mut SqliteConnection) -> Result<()> {
    check_with(conn, "PRAGMA integrity_check").await
}

/// SQLite's primary result code for a malformed database image.
///
/// The extended codes (`SQLITE_CORRUPT_VTAB` and friends) all carry it in their
/// low byte, which is how they are matched below.
const SQLITE_CORRUPT: i32 = 11;

/// Both checks return the single row `ok` on a healthy database.
///
/// "Both *report* on a healthy database" is the more accurate framing: damage
/// bad enough to break the b-tree walk makes the pragma itself fail with
/// `SQLITE_CORRUPT` rather than return a row describing the problem. Both
/// outcomes are the same answer, so both become [`DbError::Corrupt`] — a caller
/// deciding whether to show "your database is damaged" should not have to know
/// which kind of damage SQLite found.
async fn check_with(conn: &mut SqliteConnection, pragma: &'static str) -> Result<()> {
    let report: String = sqlx::query_scalar(pragma)
        .fetch_one(&mut *conn)
        .await
        .map_err(|source| classify(source, "check the database for corruption"))?;

    if report != "ok" {
        return Err(DbError::Corrupt { report });
    }

    Ok(())
}

/// Turn a sqlx failure into the right variant.
///
/// Damage does not wait politely for `quick_check` to ask about it — a file
/// mangled badly enough reports `SQLITE_CORRUPT` from the first read, which for
/// this crate is the connection that applies the pragmas. Routing every
/// corruption code to the same variant means the boot path shows "your database
/// is damaged" wherever SQLite happened to notice, instead of a generic
/// "could not open the database" for the worst cases and a precise message for
/// the mild ones.
fn classify(error: sqlx::Error, operation: &'static str) -> DbError {
    let corrupt = match &error {
        sqlx::Error::Database(database) => database
            .code()
            .and_then(|code| code.parse::<i32>().ok())
            .is_some_and(|code| code & 0xff == SQLITE_CORRUPT)
            .then(|| database.message().to_owned()),
        _ => None,
    };

    match corrupt {
        Some(report) => DbError::Corrupt { report },
        None => DbError::Query {
            operation,
            source: error,
        },
    }
}

#[cfg(test)]
mod tests {
    use sqlx::{ConnectOptions, Executor};

    use super::*;

    async fn connect(path: &Path) -> SqliteConnection {
        connect_options(path)
            .connect()
            .await
            .expect("the test database must open")
    }

    #[tokio::test]
    async fn the_pragmas_match_the_ones_v1_set() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let pool = open_pool(&dir.path().join("shiranami.db"))
            .await
            .expect("the pool must open");
        let mut conn = pool.acquire().await.expect("a connection");

        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&mut *conn)
            .await
            .expect("journal_mode");
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&mut *conn)
            .await
            .expect("foreign_keys");
        let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
            .fetch_one(&mut *conn)
            .await
            .expect("synchronous");
        let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
            .fetch_one(&mut *conn)
            .await
            .expect("busy_timeout");

        assert_eq!(journal, "wal");
        assert_eq!(foreign_keys, 1, "v1 set `foreign_keys = ON` explicitly");
        assert_eq!(synchronous, 2, "2 is FULL — SQLite's default, as v1 ran it");
        assert_eq!(
            busy_timeout,
            i64::try_from(BUSY_TIMEOUT.as_millis()).expect("the timeout fits an i64"),
            "better-sqlite3 defaulted to 5000 ms and v1 never overrode it"
        );
    }

    #[tokio::test]
    async fn opening_creates_a_missing_file() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let path = dir.path().join("nested").join("shiranami.db");
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("the parent dir");

        open_pool(&path).await.expect("the pool must open");

        assert!(path.exists(), "a fresh install has no database file yet");
    }

    #[tokio::test]
    async fn quick_check_passes_on_a_healthy_database() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let mut conn = connect(&dir.path().join("shiranami.db")).await;

        conn.execute("CREATE TABLE t (a TEXT)")
            .await
            .expect("the table must be created");

        quick_check(&mut conn)
            .await
            .expect("a fresh file is healthy");
        integrity_check(&mut conn)
            .await
            .expect("a fresh file is healthy");
    }
}
