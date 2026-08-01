//! Adoption against real databases, one per shape a user can actually have.
//!
//! Every fixture here is built by running v1's own SQL, then seeded with rows in
//! every table it has. The assertions are deliberately about *data* first and
//! schema second: a schema regression is a bug, but a row that stops existing
//! between v1 and v2 is the failure this whole phase exists to prevent.

#[path = "support/schema.rs"]
mod schema;
#[path = "support/v1.rs"]
mod v1;

use std::path::Path;

use shiranami_db::{Adoption, SCHEMA_FLOOR};
use sqlx::SqliteConnection;

use schema::{column_names, count, index_names, row_counts, scalar, table_names};
use v1::{
    build_v1_database, connect, create_legacy_tables, create_old_era_tracks_table, exec,
    has_column, seed_rows, user_version,
};

/// Names in `__drizzle_migrations`, which adoption must leave truthful.
async fn ledger_names(conn: &mut SqliteConnection) -> Vec<String> {
    sqlx::query_scalar("SELECT name FROM `__drizzle_migrations` ORDER BY id")
        .fetch_all(conn)
        .await
        .expect("the drizzle ledger must be readable")
}

/// Versions recorded in `_sqlx_migrations`.
async fn sqlx_versions(conn: &mut SqliteConnection) -> Vec<i64> {
    sqlx::query_scalar("SELECT version FROM _sqlx_migrations ORDER BY version")
        .fetch_all(conn)
        .await
        .expect("the sqlx ledger must be readable")
}

/// The state every successful open has to leave behind, whatever it started
/// from: the baseline stamped, the floor stamped, and a complete v1 ledger for
/// a build the user might roll back to.
async fn assert_adopted_invariants(conn: &mut SqliteConnection) {
    assert_eq!(
        sqlx_versions(&mut *conn).await,
        vec![1],
        "the baseline must be the only recorded sqlx migration"
    );
    assert_eq!(
        user_version(&mut *conn).await,
        SCHEMA_FLOOR,
        "the compatibility floor is frozen for the handover window"
    );
    assert_eq!(
        ledger_names(&mut *conn).await.len(),
        9,
        "a v1 build opening this file must find its whole chain applied"
    );

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
        "smart_playlists",
        "tracks",
        "youtube_mappings",
    ] {
        assert!(
            tables.contains(&expected.to_owned()),
            "`{expected}` is missing after adoption; have {tables:?}"
        );
    }
}

/// Open through the crate's real boot path.
async fn open(path: &Path) -> Adoption {
    let opened = shiranami_db::open(path)
        .await
        .expect("the database must open");
    let adoption = opened.adoption.clone();
    opened.pool.close().await;
    adoption
}

#[tokio::test]
async fn a_fresh_install_gets_the_baseline_and_a_rollback_ledger() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    assert_eq!(open(&path).await, Adoption::Fresh);

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;

    // Not a v2 requirement — a v1 build reading this file is, and it decides
    // what to run purely from these names.
    assert_eq!(
        ledger_names(&mut conn).await.first().map(String::as_str),
        Some("20260101000000_baseline")
    );
}

#[tokio::test]
async fn a_current_v1_database_is_adopted_without_touching_its_data() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    let before = row_counts(&mut seeded).await;
    drop(seeded);

    assert_eq!(
        open(&path).await,
        Adoption::Adopted {
            legacy: false,
            healed_disc_number: false,
            replayed: Vec::new(),
        },
        "a database already on the current chain needs no DDL at all"
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_eq!(row_counts(&mut conn).await, before, "rows changed");
    assert_eq!(
        scalar(&mut conn, "SELECT title FROM tracks WHERE id = 't1'").await,
        Some("Alpha".to_owned())
    );
    assert_eq!(
        scalar(&mut conn, "SELECT album_artist FROM tracks WHERE id = 't2'").await,
        Some("Various Artists".to_owned()),
        "a genuine albumartist tag must survive adoption"
    );
}

#[tokio::test]
async fn adopting_twice_more_changes_nothing() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    drop(seeded);

    open(&path).await;

    let mut conn = connect(&path).await;
    let after_first = row_counts(&mut conn).await;
    let ledger = ledger_names(&mut conn).await;
    drop(conn);

    for run in 2..=3 {
        assert_eq!(
            open(&path).await,
            Adoption::AlreadyAdopted,
            "run {run} should have recognised its own work"
        );

        let mut conn = connect(&path).await;
        assert_eq!(
            row_counts(&mut conn).await,
            after_first,
            "run {run} moved data"
        );
        assert_eq!(
            ledger_names(&mut conn).await,
            ledger,
            "run {run} rewrote the v1 ledger"
        );
        assert_eq!(
            sqlx_versions(&mut conn).await,
            vec![1],
            "run {run} re-stamped"
        );
    }
}

#[tokio::test]
async fn a_database_several_migrations_behind_is_healed_forward() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    // Stopped upgrading after `track_loudness`: no negative signals, no smart
    // playlists, no download queue, and the album-artist un-baking never ran.
    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 3).await;
    seed_rows(&mut seeded).await;
    let tracks_before = count(&mut seeded, "tracks").await;
    drop(seeded);

    let adoption = open(&path).await;
    let Adoption::Adopted { replayed, .. } = &adoption else {
        panic!("expected an adoption, got {adoption:?}");
    };

    assert_eq!(
        replayed,
        &[
            "20260101000003_negative_signals",
            "20260101000004_smart_playlists",
            "20260101000005_download_queue",
            "20260101000006_unbake_album_artist",
            "20260101000007_heal_legacy_tables",
            "20260101000008_query_indexes",
        ]
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_eq!(count(&mut conn, "tracks").await, tracks_before);

    // The data migration that was pending really ran…
    assert_eq!(
        scalar(&mut conn, "SELECT album_artist FROM tracks WHERE id = 't1'").await,
        None,
        "album_artist mirroring artist should have been un-baked"
    );
    // …and only where it was supposed to.
    assert_eq!(
        scalar(&mut conn, "SELECT album_artist FROM tracks WHERE id = 't2'").await,
        Some("Various Artists".to_owned())
    );

    // Migration 008's index swap.
    let indexes = index_names(&mut conn).await;
    assert!(indexes.contains(&"idx_playlist_tracks_playlist_position".to_owned()));
    assert!(!indexes.contains(&"idx_playlist_tracks_playlist_id".to_owned()));
}

/// The un-baking is a destructive `UPDATE` over user data, gated on the ledger
/// rather than on whether it looks needed. A user who re-scanned under v1 after
/// migration 006 ran can legitimately have `album_artist = artist` again, and
/// re-running it would throw away a real tag.
#[tokio::test]
async fn an_album_artist_retagged_after_v1_unbaked_is_left_alone() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    exec(
        &mut seeded,
        "UPDATE tracks SET album_artist = artist WHERE id = 't3'",
    )
    .await;
    drop(seeded);

    open(&path).await;

    let mut conn = connect(&path).await;
    assert_eq!(
        scalar(&mut conn, "SELECT album_artist FROM tracks WHERE id = 't3'").await,
        Some("Kaze".to_owned()),
        "a tag re-scanned after v1 already un-baked must not be nulled again"
    );
}

#[tokio::test]
async fn a_pre_migrator_database_is_baselined_without_re_running_its_ddl() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    create_legacy_tables(&mut seeded).await;
    seed_rows(&mut seeded).await;
    let before = row_counts(&mut seeded).await;
    drop(seeded);

    let adoption = open(&path).await;
    let Adoption::Adopted {
        legacy,
        healed_disc_number,
        ..
    } = adoption
    else {
        panic!("expected an adoption, got {adoption:?}");
    };

    assert!(
        legacy,
        "a database with tables and no ledger is the legacy case"
    );
    assert!(
        !healed_disc_number,
        "this era of the legacy schema already had the column"
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;

    for (table, rows) in before {
        assert_eq!(
            count(&mut conn, &table).await,
            rows,
            "`{table}` lost rows during adoption"
        );
    }
}

/// The worst case the heal path exists for: a jump from around v0.9, where only
/// `tracks` was ever created and it predates `disc_number`.
#[tokio::test]
async fn an_old_era_database_gets_its_missing_tables_and_columns() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    create_old_era_tracks_table(&mut seeded).await;
    seed_rows(&mut seeded).await;
    assert!(!has_column(&mut seeded, "tracks", "disc_number").await);
    drop(seeded);

    let adoption = open(&path).await;
    assert!(
        matches!(
            adoption,
            Adoption::Adopted {
                legacy: true,
                healed_disc_number: true,
                ..
            }
        ),
        "expected a healed legacy adoption, got {adoption:?}"
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_eq!(count(&mut conn, "tracks").await, 3, "the library survived");

    // Column *set*, not order: `ALTER TABLE` appends, so a healed `tracks` has
    // `disc_number` at the end rather than in the middle. v1 produces exactly
    // the same shape, and every query on both sides names its columns.
    let mut expected = vec![
        "album",
        "album_art",
        "album_artist",
        "artist",
        "created_at",
        "disc_number",
        "duration",
        "file_path",
        "genre",
        "id",
        "is_favorite",
        "loudness_lufs",
        "play_count",
        "title",
        "track_number",
        "updated_at",
        "year",
    ];
    expected.sort_unstable();

    assert_eq!(column_names(&mut conn, "tracks").await, expected);
}
