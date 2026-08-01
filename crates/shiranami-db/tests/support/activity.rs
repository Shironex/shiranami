//! Fixtures for the activity-side repository tests.
//!
//! Every fixture is a **real database** opened through
//! [`shiranami_db::open`] — the same boot path the app runs, so the schema
//! under test is the one the baseline migration actually produces rather than
//! DDL retyped into a test. Tables are then seeded by hand-written `INSERT`s
//! and never by the repositories, so a query and its fixture cannot agree with
//! each other about a mistake.
//!
//! # The fixture owns the connection, on purpose
//!
//! [`crate::pool`]'s pool holds exactly one connection, so a test that acquired
//! twice would not fail — it would **hang forever**, waiting for a connection
//! only it can release. Rather than trusting every test to acquire once,
//! [`Fixture`] acquires once at construction and hands out `&mut` borrows of
//! that connection. There is no way to ask it for a second one.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::path::{Path, PathBuf};

use sqlx::pool::PoolConnection;
use sqlx::{AssertSqlSafe, Executor, Sqlite, SqliteConnection, SqlitePool};
use tempfile::TempDir;

/// An open database, its one connection, and the directory holding the file.
pub(crate) struct Fixture {
    dir: TempDir,
    pool: SqlitePool,
    connection: PoolConnection<Sqlite>,
}

impl Fixture {
    /// The single connection, borrowed. Never acquires another.
    pub(crate) fn conn(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }

    /// Path of the database file, for the backup tests.
    pub(crate) fn path(&self) -> PathBuf {
        database_path(self.dir.path())
    }

    /// A path in the same directory that nothing has created yet.
    pub(crate) fn sibling(&self, name: &str) -> PathBuf {
        self.dir.path().join(name)
    }

    /// Release the connection so the file can be reopened independently.
    ///
    /// Returns the directory, which the caller must keep alive — dropping it
    /// deletes the database being inspected.
    pub(crate) async fn close(self) -> TempDir {
        drop(self.connection);
        self.pool.close().await;
        self.dir
    }
}

/// Where [`shiranami_db::open`] is pointed within a fixture directory.
pub(crate) fn database_path(dir: &Path) -> PathBuf {
    dir.join("shiranami.db")
}

/// A fresh v2 install: baseline applied, no rows.
pub(crate) async fn fresh() -> Fixture {
    let dir = tempfile::tempdir().expect("a temp dir");
    open_at(dir).await
}

/// Open the database in `dir`, whatever state it is already in.
///
/// Used both for a fresh install and — after a test has built a v1-shaped file
/// in the same directory — to adopt one.
pub(crate) async fn open_at(dir: TempDir) -> Fixture {
    let opened = shiranami_db::open(&database_path(dir.path()))
        .await
        .expect("the fixture database must open");

    let connection = opened
        .pool
        .acquire()
        .await
        .expect("the fixture's one connection");

    Fixture {
        dir,
        pool: opened.pool,
        connection,
    }
}

/// Run a statement, failing loudly with the statement that broke.
pub(crate) async fn exec(conn: &mut SqliteConnection, sql: &str) {
    conn.execute(AssertSqlSafe(sql.to_owned()))
        .await
        .unwrap_or_else(|error| panic!("failed to run `{sql}`: {error}"));
}

/// A row for the `tracks` table.
///
/// `artist` and `album` are `Option` because their nullability is the whole
/// subject of several tests — the sentinel collapse, and the difference between
/// an untagged track and one tagged the literal string "Unknown Artist".
pub(crate) struct TrackSeed<'a> {
    pub(crate) id: &'a str,
    pub(crate) title: &'a str,
    pub(crate) artist: Option<&'a str>,
    pub(crate) album: Option<&'a str>,
    pub(crate) album_artist: Option<&'a str>,
    pub(crate) album_art: Option<&'a str>,
    pub(crate) duration: Option<f64>,
    pub(crate) play_count: Option<i64>,
}

impl Default for TrackSeed<'_> {
    fn default() -> Self {
        Self {
            id: "t1",
            title: "Alpha",
            artist: Some("Aoi"),
            album: Some("Nocturne"),
            album_artist: None,
            album_art: None,
            duration: Some(200.0),
            play_count: Some(0),
        }
    }
}

/// Insert one track. `file_path` is derived from the id, which the `UNIQUE`
/// constraint on that column requires to differ per row.
pub(crate) async fn insert_track(conn: &mut SqliteConnection, seed: &TrackSeed<'_>) {
    sqlx::query(
        "INSERT INTO tracks \
           (id, file_path, title, artist, album, album_artist, album_art, duration, play_count) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(seed.id)
    .bind(format!("/music/{}.mp3", seed.id))
    .bind(seed.title)
    .bind(seed.artist)
    .bind(seed.album)
    .bind(seed.album_artist)
    .bind(seed.album_art)
    .bind(seed.duration)
    .bind(seed.play_count)
    .execute(conn)
    .await
    .unwrap_or_else(|error| panic!("seed track `{}`: {error}", seed.id));
}

/// A row for the `play_history` table.
pub(crate) struct PlaySeed<'a> {
    pub(crate) id: &'a str,
    pub(crate) track_id: &'a str,
    /// ISO-8601, as v1 wrote it. The format is load-bearing — see the history
    /// repository's module docs.
    pub(crate) played_at: &'a str,
    pub(crate) played_seconds: f64,
    pub(crate) completion_ratio: f64,
    pub(crate) completed: bool,
    pub(crate) source: &'a str,
}

impl Default for PlaySeed<'_> {
    fn default() -> Self {
        Self {
            id: "h1",
            track_id: "t1",
            played_at: "2026-06-01T12:00:00.000Z",
            played_seconds: 200.0,
            completion_ratio: 1.0,
            completed: true,
            source: "library",
        }
    }
}

/// Insert one play-history row.
pub(crate) async fn insert_play(conn: &mut SqliteConnection, seed: &PlaySeed<'_>) {
    sqlx::query(
        "INSERT INTO play_history \
           (id, track_id, played_at, played_seconds, completion_ratio, completed, source) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(seed.id)
    .bind(seed.track_id)
    .bind(seed.played_at)
    .bind(seed.played_seconds)
    .bind(seed.completion_ratio)
    .bind(seed.completed)
    .bind(seed.source)
    .execute(conn)
    .await
    .unwrap_or_else(|error| panic!("seed play `{}`: {error}", seed.id));
}

/// Read one track's `play_count`, for the aggregation assertions.
pub(crate) async fn play_count(conn: &mut SqliteConnection, track_id: &str) -> Option<i64> {
    sqlx::query_scalar("SELECT play_count FROM tracks WHERE id = ?1")
        .bind(track_id)
        .fetch_one(conn)
        .await
        .expect("read the track's play count")
}

/// Count rows in a table.
pub(crate) async fn count_rows(conn: &mut SqliteConnection, table: &str) -> i64 {
    sqlx::query_scalar(AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}")))
        .fetch_one(conn)
        .await
        .unwrap_or_else(|error| panic!("count rows in `{table}`: {error}"))
}
