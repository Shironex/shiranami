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
//! # The fixture owns the connection, on purpose
//!
//! Every repository here takes `&mut SqliteConnection` and none of them
//! acquires ([`shiranami_db::repo`]). The pool holds exactly one connection, so
//! a test that acquired twice would not fail — it would **hang forever**,
//! waiting for a connection only it can release. [`Library`] therefore acquires
//! once at construction and hands out `&mut` borrows of that one, the same
//! shape `support/activity.rs` uses for the activity side. There is no way to
//! ask it for a second.
//!
//! `#[path]`-included rather than a `mod.rs`, matching the crate's convention.

#![allow(dead_code, reason = "each test file uses a different subset")]

use shiranami_core::models::{
    PlaylistCreateInput, SmartPlaylistDefinition, SmartPlaylistField, SmartPlaylistMatchType,
    SmartPlaylistOperator, SmartPlaylistRule, TrackCreateInput, TrackUpdateInput,
};
use shiranami_db::repo::{playlist_tracks, playlists, smart_playlists, tracks};
use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqliteConnection, SqlitePool};
use tempfile::TempDir;

/// An open library, alive for as long as the binding is.
///
/// Holds the `TempDir` so the file outlives the pool — dropping them the other
/// way round leaves sqlx querying a deleted path.
pub(crate) struct Library {
    connection: PoolConnection<Sqlite>,
    _pool: SqlitePool,
    _dir: TempDir,
}

impl Library {
    /// The single connection, borrowed. Never acquires another.
    pub(crate) fn conn(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }
}

/// Open an empty library.
pub(crate) async fn fresh() -> Library {
    let dir = tempfile::tempdir().expect("a temp dir");
    let opened = shiranami_db::open(&dir.path().join("shiranami.db"))
        .await
        .expect("a fresh database must open");

    let connection = opened
        .pool
        .acquire()
        .await
        .expect("the fixture's one connection");

    Library {
        connection,
        _pool: opened.pool,
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
pub(crate) async fn add_track(conn: &mut SqliteConnection, file_path: &str, title: &str) -> String {
    tracks::add(conn, &track(file_path, title))
        .await
        .expect("the track must insert")
        .expect("an insert returns its row")
        .id
}

/// Add `count` tracks named `<prefix>-<index>`, returning their ids in order.
pub(crate) async fn add_tracks(
    conn: &mut SqliteConnection,
    prefix: &str,
    count: usize,
) -> Vec<String> {
    let incoming: Vec<TrackCreateInput> = (0..count)
        .map(|index| {
            track(
                &format!("/music/{prefix}-{index}.mp3"),
                &format!("{prefix} {index}"),
            )
        })
        .collect();

    tracks::add_many(conn, &incoming)
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
pub(crate) async fn set_created_at(conn: &mut SqliteConnection, id: &str, created_at: &str) {
    sqlx::query("UPDATE tracks SET created_at = ?1 WHERE id = ?2")
        .bind(created_at)
        .bind(id)
        .execute(conn)
        .await
        .expect("the timestamp must update");
}

/// Set a column that no create payload can reach, for tests about reads.
pub(crate) async fn set_play_count(conn: &mut SqliteConnection, id: &str, plays: i64) {
    sqlx::query("UPDATE tracks SET play_count = ?1 WHERE id = ?2")
        .bind(plays)
        .bind(id)
        .execute(conn)
        .await
        .expect("the play count must update");
}

/// Create an empty playlist and return its id.
pub(crate) async fn playlist(conn: &mut SqliteConnection, name: &str) -> String {
    playlists::create(
        conn,
        &PlaylistCreateInput {
            name: name.to_owned(),
            ..PlaylistCreateInput::default()
        },
    )
    .await
    .expect("the playlist must be created")
    .expect("a create returns its row")
    .id
}

/// The titles currently in a playlist, in playlist order.
pub(crate) async fn playlist_titles(conn: &mut SqliteConnection, playlist_id: &str) -> Vec<String> {
    playlist_tracks::get_tracks(conn, playlist_id)
        .await
        .expect("the membership must read")
        .into_iter()
        .map(|track| track.title)
        .collect()
}

/// The track ids currently in a playlist, in playlist order.
pub(crate) async fn playlist_track_ids(
    conn: &mut SqliteConnection,
    playlist_id: &str,
) -> Vec<String> {
    playlist_tracks::get_tracks(conn, playlist_id)
        .await
        .expect("the membership must read")
        .into_iter()
        .map(|track| track.id)
        .collect()
}

/// A smart-playlist rule with no upper bound.
pub(crate) fn rule(
    field: SmartPlaylistField,
    operator: SmartPlaylistOperator,
    value: &str,
) -> SmartPlaylistRule {
    SmartPlaylistRule {
        field,
        operator,
        value: value.to_owned(),
        value_to: None,
    }
}

/// A rule definition.
pub(crate) fn definition(
    match_type: SmartPlaylistMatchType,
    rules: Vec<SmartPlaylistRule>,
) -> SmartPlaylistDefinition {
    SmartPlaylistDefinition { match_type, rules }
}

/// Add a track carrying a genre and a year, returning its id.
pub(crate) async fn tagged(
    conn: &mut SqliteConnection,
    title: &str,
    genre: &str,
    year: Option<i32>,
) -> String {
    tracks::add(
        conn,
        &TrackCreateInput {
            file_path: format!("/music/{title}.mp3"),
            title: title.to_owned(),
            artist: Some("Test Artist".to_owned()),
            album: Some("Test Album".to_owned()),
            genre: Some(genre.to_owned()),
            year,
            duration: Some(200.0),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("the track must insert")
    .expect("an insert returns its row")
    .id
}

/// Evaluate a definition and return the matching titles.
pub(crate) async fn preview(
    conn: &mut SqliteConnection,
    definition: &SmartPlaylistDefinition,
) -> Vec<String> {
    smart_playlists::preview(conn, definition)
        .await
        .expect("the preview must evaluate")
        .into_iter()
        .map(|track| track.title)
        .collect()
}

/// A patch that changes only the title.
pub(crate) fn retitle(title: &str) -> TrackUpdateInput {
    TrackUpdateInput {
        title: Some(title.to_owned()),
        ..TrackUpdateInput::default()
    }
}

/// Read one column back as text, for assertions about what was stored.
pub(crate) async fn column(
    conn: &mut SqliteConnection,
    sql: &'static str,
    id: &str,
) -> Option<String> {
    sqlx::query_scalar(sql)
        .bind(id)
        .fetch_one(conn)
        .await
        .expect("the column must read")
}
