//! Building the databases a user can actually hand v2.
//!
//! Every fixture here is an *independent* reimplementation of what
//! `shiranami-db` does — the drizzle SQL is re-split, the ledger DDL is retyped,
//! the legacy DDL is ported from v1's own test helper. A test that calls the
//! code under test to build its own fixture proves only that the code agrees
//! with itself.
//!
//! The one thing it shares with the crate is the frozen `v1_sql/` copies, and
//! those are pinned against a fixture generated from `packages/database` by
//! `crates/shiranami-db/src/adopt/v1.rs`. That is what closes the loop.
//!
//! `#[path]`-included rather than a `mod.rs`, because `mod.rs` is a manifest in
//! this workspace and this file is anything but.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::path::Path;

use shiranami_db::pool::connect_options;
use sqlx::{AssertSqlSafe, ConnectOptions, Executor, SqliteConnection};

/// v1's nine migrations, frozen into the crate under test.
///
/// Re-included here rather than reached for through the crate's API: these
/// files are the input to adoption, and a test should hold the input.
pub(crate) const V1_SQL: [(&str, &str); 9] = [
    (
        "20260101000000_baseline",
        include_str!("../../src/adopt/v1_sql/20260101000000_baseline.sql"),
    ),
    (
        "20260101000001_album_artist",
        include_str!("../../src/adopt/v1_sql/20260101000001_album_artist.sql"),
    ),
    (
        "20260101000002_track_loudness",
        include_str!("../../src/adopt/v1_sql/20260101000002_track_loudness.sql"),
    ),
    (
        "20260101000003_negative_signals",
        include_str!("../../src/adopt/v1_sql/20260101000003_negative_signals.sql"),
    ),
    (
        "20260101000004_smart_playlists",
        include_str!("../../src/adopt/v1_sql/20260101000004_smart_playlists.sql"),
    ),
    (
        "20260101000005_download_queue",
        include_str!("../../src/adopt/v1_sql/20260101000005_download_queue.sql"),
    ),
    (
        "20260101000006_unbake_album_artist",
        include_str!("../../src/adopt/v1_sql/20260101000006_unbake_album_artist.sql"),
    ),
    (
        "20260101000007_heal_legacy_tables",
        include_str!("../../src/adopt/v1_sql/20260101000007_heal_legacy_tables.sql"),
    ),
    (
        "20260101000008_query_indexes",
        include_str!("../../src/adopt/v1_sql/20260101000008_query_indexes.sql"),
    ),
];

/// Open a connection with the app's own pragmas.
pub(crate) async fn connect(path: &Path) -> SqliteConnection {
    connect_options(path)
        .connect()
        .await
        .expect("the test database must open")
}

/// Run a statement, failing loudly with the statement that broke.
pub(crate) async fn exec(conn: &mut SqliteConnection, sql: &str) {
    conn.execute(AssertSqlSafe(sql.to_owned()))
        .await
        .unwrap_or_else(|error| panic!("failed to run `{sql}`: {error}"));
}

/// Split a migration file the way drizzle-kit's marker says to.
pub(crate) fn statements(sql: &str) -> Vec<&str> {
    sql.split("--> statement-breakpoint")
        .map(str::trim)
        .filter(|statement| !statement.is_empty())
        .collect()
}

// ── Building v1-shaped databases ──────────────────────────────────────────────

/// Apply v1's migrations `0..through` and write the matching ledger.
///
/// `through = 9` is a database a user on the current v1 release has;
/// `through = 3` is one that stopped upgrading three migrations ago.
pub(crate) async fn build_v1_database(conn: &mut SqliteConnection, through: usize) {
    for (_, sql) in &V1_SQL[..through] {
        for statement in statements(sql) {
            exec(&mut *conn, statement).await;
        }
    }

    write_drizzle_ledger(conn, through).await;
    set_user_version(conn, 8).await;
}

/// Create `__drizzle_migrations` in rc.2's shape and record the first `through`
/// migrations as applied.
///
/// The `hash` column gets a placeholder. Nothing reads it: drizzle 1.0.0-rc.2
/// selects pending migrations purely by name-set membership, and v2 only ever
/// reads `name`. A test that fed it a real hash would be asserting something no
/// production code depends on.
pub(crate) async fn write_drizzle_ledger(conn: &mut SqliteConnection, through: usize) {
    exec(
        &mut *conn,
        "CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (
            id INTEGER PRIMARY KEY,
            hash text NOT NULL,
            created_at numeric,
            name text,
            applied_at TEXT
        )",
    )
    .await;

    for (index, (name, _)) in V1_SQL[..through].iter().enumerate() {
        sqlx::query(
            "INSERT INTO `__drizzle_migrations` (hash, created_at, name, applied_at)
             VALUES (?1, ?2, ?3, '2026-07-01T00:00:00.000Z')",
        )
        .bind(format!("hash-of-{name}"))
        .bind(1_767_225_600_000_i64 + i64::try_from(index).expect("nine fits an i64") * 1_000)
        .bind(*name)
        .execute(&mut *conn)
        .await
        .expect("the ledger row must insert");
    }
}

/// Stamp `PRAGMA user_version`.
pub(crate) async fn set_user_version(conn: &mut SqliteConnection, version: i64) {
    exec(conn, &format!("PRAGMA user_version = {version}")).await;
}

/// Read `PRAGMA user_version`.
pub(crate) async fn user_version(conn: &mut SqliteConnection) -> i64 {
    sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(conn)
        .await
        .expect("user_version must be readable")
}
