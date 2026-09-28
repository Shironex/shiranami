//! Migration `0009_track_content_hash.sql`, run up from a database at `0008`.
//!
//! A fresh [`shiranami_db::open`] has already run `0009` on empty tables, which
//! proves nothing about a user's library. So this suite builds a real `0008`
//! database first: it opens one the app's way, then takes `0009` back out
//! (index, column and ledger row), seeds rows the way a `0008` build would
//! have written them, and reopens it through the full boot path. What `open`
//! does next is exactly what an upgrading user's first launch does.

use std::path::Path;

use shiranami_db::repo::tracks;
use sqlx::{Connection, SqliteConnection};

/// Open `path` with a plain connection, outside the app's pool.
async fn raw(path: &Path) -> SqliteConnection {
    SqliteConnection::connect(&format!("sqlite://{}", path.display()))
        .await
        .expect("the file opens")
}

/// Build a `0008` database holding two tracks, one of them favourited.
async fn v0008(path: &Path) {
    let opened = shiranami_db::open(path)
        .await
        .expect("a fresh database opens");
    opened.pool.close().await;

    let mut conn = raw(path).await;
    sqlx::raw_sql(
        "DROP INDEX idx_tracks_content_hash;
         ALTER TABLE tracks DROP COLUMN content_hash;
         DELETE FROM _sqlx_migrations WHERE version = 9;
         INSERT INTO tracks (id, file_path, title, is_favorite, play_count)
           VALUES ('11111111-1111-4111-8111-111111111111', '/music/a.mp3', 'A', 1, 7),
                  ('22222222-2222-4222-8222-222222222222', '/music/b.mp3', 'B', 0, 0);",
    )
    .execute(&mut conn)
    .await
    .expect("the database is taken back to 0008");

    let columns: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('tracks')")
        .fetch_all(&mut conn)
        .await
        .expect("the schema reads");
    assert!(
        !columns.iter().any(|name| name == "content_hash"),
        "the fixture really is at 0008"
    );
    conn.close().await.expect("the connection closes");
}

#[tokio::test]
async fn upgrading_from_0008_adds_the_column_and_index_and_keeps_every_row() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = dir.path().join("shiranami.db");
    v0008(&path).await;

    let opened = shiranami_db::open(&path).await.expect("the upgrade opens");
    let mut conn = opened.pool.acquire().await.expect("the one connection");

    let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(&mut *conn)
        .await
        .expect("the ledger reads");
    assert_eq!(version, 9);

    let index: Option<String> = sqlx::query_scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_tracks_content_hash'",
    )
    .fetch_optional(&mut *conn)
    .await
    .expect("the schema reads");
    assert!(
        index.is_some_and(|sql| sql.contains("WHERE")),
        "a partial index"
    );

    let library = tracks::get_all(&mut conn).await.expect("the library reads");
    assert_eq!(library.len(), 2, "no row is lost");
    let a = library
        .iter()
        .find(|t| t.file_path == "/music/a.mp3")
        .expect("a");
    assert_eq!(a.play_count, Some(7));
    assert_eq!(a.is_favorite, Some(true));

    let pending = tracks::unhashed(&mut conn, 0, 10).await.expect("read");
    assert_eq!(
        pending.len(),
        2,
        "every pre-0009 row waits for the backfill"
    );
}

#[tokio::test]
async fn the_compatibility_floor_is_untouched() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = dir.path().join("shiranami.db");
    v0008(&path).await;

    let opened = shiranami_db::open(&path).await.expect("the upgrade opens");
    let mut conn = opened.pool.acquire().await.expect("the one connection");
    let floor: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut *conn)
        .await
        .expect("the pragma reads");

    assert_eq!(
        floor,
        shiranami_db::compat::SCHEMA_FLOOR,
        "an additive migration keeps the v1 rollback window open"
    );
}

/// A rollback to this build from a newer one: the ledger names a version this
/// build has never heard of. v2.0.0 refused exactly this (`VersionMissing`);
/// this build opens it, because every post-baseline migration is additive.
#[tokio::test]
async fn a_ledger_from_a_newer_build_still_opens() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = dir.path().join("shiranami.db");
    let opened = shiranami_db::open(&path)
        .await
        .expect("a fresh database opens");
    opened.pool.close().await;

    let mut conn = raw(&path).await;
    sqlx::query(
        "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
         VALUES (99, 'from a newer build', TRUE, X'00', 0)",
    )
    .execute(&mut conn)
    .await
    .expect("the newer build's ledger row is written");
    conn.close().await.expect("the connection closes");

    let reopened = shiranami_db::open(&path)
        .await
        .expect("an unknown, newer migration must not make the database unopenable");
    let mut conn = reopened.pool.acquire().await.expect("the one connection");
    assert!(
        tracks::get_all(&mut conn)
            .await
            .expect("the library reads")
            .is_empty()
    );
}

/// What stays refused with `ignore_missing` on: a known migration whose
/// recorded checksum differs from this build's file.
#[tokio::test]
async fn a_tampered_known_migration_is_still_refused() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = dir.path().join("shiranami.db");
    let opened = shiranami_db::open(&path)
        .await
        .expect("a fresh database opens");
    opened.pool.close().await;

    let mut conn = raw(&path).await;
    sqlx::query("UPDATE _sqlx_migrations SET checksum = X'00' WHERE version = 9")
        .execute(&mut conn)
        .await
        .expect("the ledger row is altered");
    conn.close().await.expect("the connection closes");

    assert!(shiranami_db::open(&path).await.is_err());
}
