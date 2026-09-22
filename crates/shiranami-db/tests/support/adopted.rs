//! Shared post-open invariants for the adoption suites.
//!
//! `adoption.rs` grew past the module-shape cap when v2's own migrations
//! gained usable-on-every-path assertions, so the invariant half — what every
//! successful open must leave behind, whatever it started from — lives here,
//! pulled in with `#[path]` like the other support modules.

#![allow(dead_code, reason = "each test file uses a different subset")]

use std::path::Path;

use shiranami_db::{Adoption, MIGRATOR, SCHEMA_FLOOR};
use sqlx::SqliteConnection;

/// Names in `__drizzle_migrations`, which adoption must leave truthful.
pub(crate) async fn ledger_names(conn: &mut SqliteConnection) -> Vec<String> {
    sqlx::query_scalar("SELECT name FROM `__drizzle_migrations` ORDER BY id")
        .fetch_all(conn)
        .await
        .expect("the drizzle ledger must be readable")
}

/// Versions recorded in `_sqlx_migrations`.
pub(crate) async fn sqlx_versions(conn: &mut SqliteConnection) -> Vec<i64> {
    sqlx::query_scalar("SELECT version FROM _sqlx_migrations ORDER BY version")
        .fetch_all(conn)
        .await
        .expect("the sqlx ledger must be readable")
}

/// Every migration compiled into this build, in version order.
///
/// Derived rather than hard-coded, because the property under test is not "there
/// are two migrations" but "adoption stamps the baseline and *runs* everything
/// after it". Adoption stamps only version 1; if a later migration were ever
/// stamped instead of applied, its DDL would silently never reach an adopted
/// database and the failure would surface as a missing table months later.
pub(crate) fn expected_sqlx_versions() -> Vec<i64> {
    MIGRATOR.iter().map(|migration| migration.version).collect()
}

/// `PRAGMA user_version`, as `support/v1.rs` reads it — a copy rather than a
/// second `#[path]` include, which would compile the whole fixture module twice
/// into one test binary.
async fn user_version(conn: &mut SqliteConnection) -> i64 {
    sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(conn)
        .await
        .expect("user_version must be readable")
}

/// Table names, unsorted and unfiltered — the invariants below only ask
/// `contains`, so the ledgers' presence is harmless. The full-featured version
/// lives in `support/schema.rs`; see [`user_version`] for why it is not
/// included here.
async fn table_names(conn: &mut SqliteConnection) -> Vec<String> {
    sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
        .fetch_all(conn)
        .await
        .expect("sqlite_master must be readable")
}

/// The state every successful open has to leave behind, whatever it started
/// from: the whole sqlx chain applied, the floor stamped, and a complete v1
/// ledger for a build the user might roll back to.
pub(crate) async fn assert_adopted_invariants(conn: &mut SqliteConnection) {
    assert_eq!(
        sqlx_versions(&mut *conn).await,
        expected_sqlx_versions(),
        "every sqlx migration must be recorded exactly once, in order"
    );
    assert_eq!(
        user_version(&mut *conn).await,
        SCHEMA_FLOOR,
        "the compatibility floor is frozen for the handover window"
    );
    // Every chain name present, not an exact count: a database that ran the
    // stranded dev migration legitimately carries a tenth name, and what a
    // rolled-back v1 build needs is its own nine — drizzle matches by name-set
    // membership and ignores names that are not its own.
    let names = ledger_names(&mut *conn).await;
    for (name, _) in &super::v1::V1_SQL {
        assert!(
            names.contains(&(*name).to_owned()),
            "a v1 build opening this file must find `{name}` applied; have {names:?}"
        );
    }

    // Migration `0003`'s columns — proving an `ALTER TABLE` migration reaches
    // every database shape too.
    let columns = super::schema::column_names(&mut *conn, "tracks").await;
    for expected in ["bpm", "musical_key"] {
        assert!(
            columns.contains(&expected.to_owned()),
            "`tracks.{expected}` is missing after adoption; have {columns:?}"
        );
    }

    let tables = table_names(&mut *conn).await;
    for expected in [
        "download_queue",
        "folders",
        "negative_signals",
        "play_history",
        "playlist_tracks",
        "playlists",
        "radio_favorites",
        "recommendations",
        // v2's own, from migration `0002` — no v1 counterpart, so its presence
        // here is what proves post-baseline migrations reach adopted databases.
        "scrobble_queue",
        "smart_playlists",
        "tracks",
        // v2's own, from migration `0004` — the FTS5 search index over `tracks`.
        "tracks_fts",
        "youtube_mappings",
    ] {
        assert!(
            tables.contains(&expected.to_owned()),
            "`{expected}` is missing after adoption; have {tables:?}"
        );
    }
}

/// Every table the database had before still holds exactly the rows it held,
/// and any table adoption *added* arrived empty.
///
/// Stricter than comparing the two lists outright, which stopped being the right
/// assertion once v2 gained migrations of its own: a new empty table is what an
/// additive migration is supposed to look like, while a new table with rows in
/// it, or any change to a v1 count, is data loss or invention.
pub(crate) fn assert_rows_preserved(before: &[(String, i64)], after: &[(String, i64)]) {
    for (table, rows) in before {
        let found = after
            .iter()
            .find(|(name, _)| name == table)
            .unwrap_or_else(|| panic!("`{table}` disappeared during adoption"));
        assert_eq!(found.1, *rows, "`{table}` changed row count");
    }

    for (table, rows) in after {
        if before.iter().any(|(name, _)| name == table) {
            continue;
        }
        // The FTS index (migration `0004`) is *derived* content: the migration
        // rebuilds it from whatever `tracks` already holds, so its virtual
        // table and shadow tables legitimately arrive full on an adopted
        // database. Emptiness is the wrong assertion for a derived index —
        // `assert_track_search_is_usable` proves it holds the right rows.
        if table == "tracks_fts" || table.starts_with("tracks_fts_") {
            continue;
        }
        assert_eq!(*rows, 0, "the new table `{table}` arrived with rows in it");
    }
}

/// Open through the crate's real boot path.
pub(crate) async fn open(path: &Path) -> Adoption {
    let opened = shiranami_db::open(path)
        .await
        .expect("the database must open");
    let adoption = opened.adoption.clone();
    opened.pool.close().await;
    adoption
}
