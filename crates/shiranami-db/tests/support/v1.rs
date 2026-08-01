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

// ── Pre-migrator databases ────────────────────────────────────────────────────

/// Whether a table exists.
pub(crate) async fn has_table(conn: &mut SqliteConnection, name: &str) -> bool {
    sqlx::query_scalar::<_, i64>("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?1")
        .bind(name)
        .fetch_optional(conn)
        .await
        .expect("sqlite_master must be readable")
        .is_some()
}

/// Whether a table has a column.
pub(crate) async fn has_column(conn: &mut SqliteConnection, table: &str, column: &str) -> bool {
    sqlx::query_scalar::<_, i64>("SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2")
        .bind(table)
        .bind(column)
        .fetch_optional(conn)
        .await
        .expect("pragma_table_info must be readable")
        .is_some()
}

/// The schema v1's `createTables()` produced before versioned migrations —
/// real tables and data, no `__drizzle_migrations` at all.
///
/// A verbatim port of `packages/database/src/test/helpers/legacy-schema.ts`,
/// down to the unquoted identifiers and the `NOT NULL DEFAULT` ordering. The
/// *text* differs from the drizzle baseline's; the meaning does not, which is
/// the whole point of the test that adopts it.
pub(crate) async fn create_legacy_tables(conn: &mut SqliteConnection) {
    for statement in [
        "CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            artist TEXT DEFAULT 'Unknown Artist',
            album TEXT DEFAULT 'Unknown Album',
            duration REAL,
            genre TEXT,
            year INTEGER,
            track_number INTEGER,
            disc_number INTEGER,
            album_art TEXT,
            is_favorite INTEGER DEFAULT 0,
            play_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            cover_art TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS playlist_tracks (
            id TEXT PRIMARY KEY,
            playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            UNIQUE(playlist_id, track_id)
        )",
        "CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            last_scanned TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS radio_favorites (
            id TEXT PRIMARY KEY,
            station_uuid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            url_resolved TEXT NOT NULL,
            homepage TEXT,
            favicon TEXT,
            country TEXT,
            country_code TEXT,
            language TEXT,
            codec TEXT,
            bitrate INTEGER,
            tags TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS play_history (
            id TEXT PRIMARY KEY,
            track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            played_at TEXT NOT NULL DEFAULT (datetime('now')),
            played_seconds REAL NOT NULL,
            completion_ratio REAL NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'library'
        )",
        "CREATE TABLE IF NOT EXISTS youtube_mappings (
            id TEXT PRIMARY KEY,
            track_id TEXT NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
            youtube_id TEXT NOT NULL,
            searched_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS recommendations (
            kind TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            generated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path)",
        "CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)",
        "CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album)",
        "CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(is_favorite)",
        "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id)",
        "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id)",
        "CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path)",
        "CREATE INDEX IF NOT EXISTS idx_radio_favorites_station_uuid ON radio_favorites(station_uuid)",
        "CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id)",
        "CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at)",
        "CREATE INDEX IF NOT EXISTS idx_youtube_mappings_track_id ON youtube_mappings(track_id)",
    ] {
        exec(&mut *conn, statement).await;
    }
}

/// A much older database: `tracks` alone, without `disc_number`.
///
/// Reproduces the jump a user makes from around v0.9 straight to a build with
/// the migrator — the case v1's `heal_legacy_tables` migration and its
/// `disc_number` ALTER exist for.
pub(crate) async fn create_old_era_tracks_table(conn: &mut SqliteConnection) {
    for statement in [
        "CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            artist TEXT DEFAULT 'Unknown Artist',
            album TEXT DEFAULT 'Unknown Album',
            duration REAL,
            genre TEXT,
            year INTEGER,
            track_number INTEGER,
            album_art TEXT,
            is_favorite INTEGER DEFAULT 0,
            play_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        "CREATE INDEX IF NOT EXISTS idx_tracks_file_path ON tracks(file_path)",
        "CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)",
        "CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album)",
        "CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(is_favorite)",
    ] {
        exec(&mut *conn, statement).await;
    }
}

// ── A library worth losing ────────────────────────────────────────────────────

/// Every table this database has, given rows.
///
/// Skips tables the database is too old to have, so the same seed works on a
/// legacy fixture, a database three migrations behind, and a current one.
/// `t1.album_artist` is deliberately set equal to its `artist`: that is the row
/// v1's `unbake_album_artist` migration nulls, and the one that proves the data
/// migration runs exactly once.
pub(crate) async fn seed_rows(conn: &mut SqliteConnection) {
    exec(
        &mut *conn,
        "INSERT INTO tracks (id, file_path, title, artist, album, duration, play_count)
         VALUES ('t1', '/music/alpha.mp3', 'Alpha', 'Aoi', 'Nocturne', 201.5, 7),
                ('t2', '/music/beta.flac', 'Beta', 'Aoi', 'Nocturne', 180.0, 3),
                ('t3', '/music/gamma.m4a', 'Gamma', 'Kaze', 'Drift', 240.25, 0)",
    )
    .await;

    if has_column(&mut *conn, "tracks", "album_artist").await {
        exec(
            &mut *conn,
            "UPDATE tracks SET album_artist = 'Aoi' WHERE id = 't1';
             UPDATE tracks SET album_artist = 'Various Artists' WHERE id = 't2'",
        )
        .await;
    }

    if has_column(&mut *conn, "tracks", "loudness_lufs").await {
        exec(
            &mut *conn,
            "UPDATE tracks SET loudness_lufs = -14.2 WHERE id = 't1'",
        )
        .await;
    }

    for (table, insert) in [
        (
            "folders",
            "INSERT INTO folders (id, path) VALUES ('f1', '/music'), ('f2', '/music/live')",
        ),
        (
            "playlists",
            "INSERT INTO playlists (id, name, description) VALUES ('p1', 'Late night', 'for 2am')",
        ),
        (
            "playlist_tracks",
            "INSERT INTO playlist_tracks (id, playlist_id, track_id, position)
             VALUES ('pt1', 'p1', 't1', 0), ('pt2', 'p1', 't2', 1)",
        ),
        (
            "smart_playlists",
            "INSERT INTO smart_playlists (id, name, match_type, rules)
             VALUES ('s1', 'Often played', 'all', '[{\"field\":\"playCount\"}]')",
        ),
        (
            "play_history",
            "INSERT INTO play_history (id, track_id, played_seconds, completion_ratio, completed)
             VALUES ('h1', 't1', 201.5, 1.0, 1),
                    ('h2', 't1', 100.0, 0.5, 0),
                    ('h3', 't2', 180.0, 1.0, 1)",
        ),
        (
            "negative_signals",
            "INSERT INTO negative_signals (id, track_id, artist) VALUES ('n1', 't3', 'Kaze')",
        ),
        (
            "recommendations",
            "INSERT INTO recommendations (kind, payload) VALUES ('shelf', '{\"items\":[]}')",
        ),
        (
            "youtube_mappings",
            "INSERT INTO youtube_mappings (id, track_id, youtube_id)
             VALUES ('y1', 't1', 'dQw4w9WgXcQ'), ('y2', 't2', 'oHg5SJYRHA0')",
        ),
        (
            "radio_favorites",
            "INSERT INTO radio_favorites (id, station_uuid, name, url, url_resolved)
             VALUES ('r1', 'uuid-1', 'Lofi Girl', 'https://a.example/s', 'https://a.example/s.mp3')",
        ),
        (
            "download_queue",
            "INSERT INTO download_queue (id, url, title, status, enqueued_at)
             VALUES ('d1', 'https://y.example/watch?v=x', 'Queued', 'pending', 1767225600)",
        ),
    ] {
        if has_table(&mut *conn, table).await {
            exec(&mut *conn, insert).await;
        }
    }
}
