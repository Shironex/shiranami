//! A real database, opened the way the app opens one.
//!
//! The repository tests run against [`shiranami_db::open`] on a temporary file
//! — the full boot path, baseline migration included — rather than against
//! hand-written DDL. That is the opposite choice from `support/v1.rs`, and for
//! the opposite reason: there, an independent reimplementation of the schema is
//! the whole point, because the thing under test *is* the schema. Here the
//! schema is a given and the queries are under test, so a fixture that drifts
//! from the shipped schema would only ever produce false passes.
//!
//! `#[path]`-included rather than a `mod.rs`, matching the crate's convention.

#![allow(dead_code, reason = "each test file uses a different subset")]

use shiranami_core::models::{TrackCreateInput, TrackUpdateInput};
use shiranami_db::repo::tracks;
use sqlx::SqlitePool;
use tempfile::TempDir;

/// An open library, alive for as long as the binding is.
///
/// Holds the `TempDir` so the file outlives the pool — dropping them the other
/// way round leaves sqlx querying a deleted path.
pub(crate) struct Library {
    /// The pool every repository call goes through.
    pub(crate) pool: SqlitePool,
    _dir: TempDir,
}

/// Open an empty library.
pub(crate) async fn fresh() -> Library {
    let dir = tempfile::tempdir().expect("a temp dir");
    let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
        .await
        .expect("a fresh database must open");

    Library {
        pool: opened.pool,
        _dir: dir,
    }
}

/// A create payload with everything tagged, for tests that do not care.
///
/// Mirrors the `insertTrack` helper in v1's integration suite, down to the
/// values, so a ported assertion reads the same on both sides.
pub(crate) fn track(file_path: &str, title: &str) -> TrackCreateInput {
    TrackCreateInput {
        file_path: file_path.to_owned(),
        title: title.to_owned(),
        artist: Some("Test Artist".to_owned()),
        album: Some("Test Album".to_owned()),
        duration: Some(200.0),
        ..TrackCreateInput::default()
    }
}

/// Add a track and return its id.
pub(crate) async fn add_track(library: &Library, file_path: &str, title: &str) -> String {
    tracks::add(&library.pool, &track(file_path, title))
        .await
        .expect("the track must insert")
        .expect("an insert returns its row")
        .id
}

/// Add `count` tracks named `<prefix>-<index>`, returning their ids in order.
pub(crate) async fn add_tracks(library: &Library, prefix: &str, count: usize) -> Vec<String> {
    let incoming: Vec<TrackCreateInput> = (0..count)
        .map(|index| {
            track(
                &format!("/music/{prefix}-{index}.mp3"),
                &format!("{prefix} {index}"),
            )
        })
        .collect();

    tracks::add_many(&library.pool, &incoming)
        .await
        .expect("the tracks must insert")
        .into_iter()
        .map(|inserted| inserted.id)
        .collect()
}

/// Force a track's `created_at`, for tests about ordering.
///
/// The column defaults to `datetime('now')` at one-second resolution, so tests
/// that insert in a loop would otherwise all land in the same second and prove
/// nothing about the sort key.
pub(crate) async fn set_created_at(library: &Library, id: &str, created_at: &str) {
    sqlx::query("UPDATE tracks SET created_at = ?1 WHERE id = ?2")
        .bind(created_at)
        .bind(id)
        .execute(&library.pool)
        .await
        .expect("the timestamp must update");
}

/// Set a column that no create payload can reach, for tests about reads.
pub(crate) async fn set_play_count(library: &Library, id: &str, plays: i64) {
    sqlx::query("UPDATE tracks SET play_count = ?1 WHERE id = ?2")
        .bind(plays)
        .bind(id)
        .execute(&library.pool)
        .await
        .expect("the play count must update");
}

/// A patch that changes only the title.
pub(crate) fn retitle(title: &str) -> TrackUpdateInput {
    TrackUpdateInput {
        title: Some(title.to_owned()),
        ..TrackUpdateInput::default()
    }
}

/// Read one column back as text, for assertions about what was stored.
pub(crate) async fn column(library: &Library, sql: &'static str, id: &str) -> Option<String> {
    sqlx::query_scalar(sql)
        .bind(id)
        .fetch_one(&library.pool)
        .await
        .expect("the column must read")
}
