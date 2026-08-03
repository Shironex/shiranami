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

use shiranami_db::{Adoption, MIGRATOR, SCHEMA_FLOOR};
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

/// Every migration compiled into this build, in version order.
///
/// Derived rather than hard-coded, because the property under test is not "there
/// are two migrations" but "adoption stamps the baseline and *runs* everything
/// after it". Adoption stamps only version 1; if a later migration were ever
/// stamped instead of applied, its DDL would silently never reach an adopted
/// database and the failure would surface as a missing table months later.
fn expected_sqlx_versions() -> Vec<i64> {
    MIGRATOR.iter().map(|migration| migration.version).collect()
}

/// The state every successful open has to leave behind, whatever it started
/// from: the whole sqlx chain applied, the floor stamped, and a complete v1
/// ledger for a build the user might roll back to.
async fn assert_adopted_invariants(conn: &mut SqliteConnection) {
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
    for (name, _) in &v1::V1_SQL {
        assert!(
            names.contains(&(*name).to_owned()),
            "a v1 build opening this file must find `{name}` applied; have {names:?}"
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
        "youtube_mappings",
    ] {
        assert!(
            tables.contains(&expected.to_owned()),
            "`{expected}` is missing after adoption; have {tables:?}"
        );
    }

    // Migration `0003`'s columns — the column-adding sibling of the
    // `scrobble_queue` check above, proving an `ALTER TABLE` migration reaches
    // every database shape too.
    let columns = column_names(&mut *conn, "tracks").await;
    for expected in ["bpm", "musical_key"] {
        assert!(
            columns.contains(&expected.to_owned()),
            "`tracks.{expected}` is missing after adoption; have {columns:?}"
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
fn assert_rows_preserved(before: &[(String, i64)], after: &[(String, i64)]) {
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
        assert_eq!(*rows, 0, "the new table `{table}` arrived with rows in it");
    }
}

/// The scrobble queue really works on whatever database this is, not merely
/// exists: its index is there and its CHECK refuses the one state v1's pure
/// state machine dropped rows for — a parked scrobble that no backend owes.
async fn assert_scrobble_queue_is_usable(conn: &mut SqliteConnection) {
    assert!(
        index_names(&mut *conn)
            .await
            .contains(&"idx_scrobble_queue_due".to_owned()),
        "the due-items index is missing"
    );
    assert_eq!(count(&mut *conn, "scrobble_queue").await, 0);

    exec(
        &mut *conn,
        "INSERT INTO scrobble_queue \
           (id, artist, track, album, duration_seconds, started_at, \
            lastfm_pending, listenbrainz_pending, attempts, next_attempt_at, enqueued_at) \
         VALUES ('q1', 'Kaze', 'Alpha', NULL, NULL, 1000, 1, 0, 0, 0, 0)",
    )
    .await;
    assert_eq!(count(&mut *conn, "scrobble_queue").await, 1);

    let orphan = sqlx::query(
        "INSERT INTO scrobble_queue \
           (id, artist, track, album, duration_seconds, started_at, \
            lastfm_pending, listenbrainz_pending, attempts, next_attempt_at, enqueued_at) \
         VALUES ('q2', 'Kaze', 'Beta', NULL, NULL, 1000, 0, 0, 0, 0, 0)",
    )
    .execute(&mut *conn)
    .await;
    assert!(
        orphan.is_err(),
        "a parked scrobble owing no backend must be unstorable"
    );

    exec(&mut *conn, "DELETE FROM scrobble_queue").await;
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

/// v2's first post-baseline migration, on the database shape that has no idea
/// it exists.
///
/// Adoption stamps `0001_baseline.sql` without running it, because an adopted
/// database already has those tables. Everything after the baseline gets the
/// opposite treatment — run for real, never stamped — and this is the test that
/// says so about a *v1* file rather than about the migrator in isolation.
#[tokio::test]
async fn the_post_baseline_migration_runs_on_an_adopted_v1_database() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    assert!(
        !v1::has_table(&mut seeded, "scrobble_queue").await,
        "the fixture must start without v2's table, or this proves nothing"
    );
    let before = row_counts(&mut seeded).await;
    drop(seeded);

    open(&path).await;

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_scrobble_queue_is_usable(&mut conn).await;
    assert_rows_preserved(&before, &row_counts(&mut conn).await);
}

/// The same migration on a fresh install, where it runs alongside the baseline
/// rather than after a stamp.
#[tokio::test]
async fn the_post_baseline_migration_runs_on_a_fresh_database() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    assert_eq!(open(&path).await, Adoption::Fresh);

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_scrobble_queue_is_usable(&mut conn).await;

    // The rollback ledger is v1's nine names and nothing else. A v2-only table
    // must not leak into the chain a rolled-back v1 build would try to replay.
    assert_eq!(ledger_names(&mut conn).await.len(), 9);
}

// ── The stranded `track_bpm_key` dev migration ───────────────────────────────

/// The addon branch's migration name, exactly as its drizzle folder spelt it.
const STRANDED_NAME: &str = "20260101000008_track_bpm_key";

/// Apply the stranded dev migration the way `feat/native-bpm-key-addon`'s
/// drizzle did: the two `ALTER TABLE`s plus a ledger row. The SQL is the
/// branch's `migration.sql` verbatim.
async fn apply_stranded_bpm_key(conn: &mut SqliteConnection) {
    exec(&mut *conn, "ALTER TABLE `tracks` ADD `bpm` real").await;
    exec(&mut *conn, "ALTER TABLE `tracks` ADD `musical_key` text").await;
    exec(
        &mut *conn,
        &format!(
            "INSERT INTO `__drizzle_migrations` (hash, created_at, name, applied_at)
             VALUES ('hash-of-{STRANDED_NAME}', 1767225608000, '{STRANDED_NAME}',
                     '2026-06-24T00:00:00.000Z')"
        ),
    )
    .await;
}

/// The C++-measured values a dev profile carries in those columns.
async fn seed_stranded_measurements(conn: &mut SqliteConnection) {
    exec(
        &mut *conn,
        "UPDATE tracks SET bpm = 84.9, musical_key = 'A minor' WHERE id = 't1'",
    )
    .await;
}

async fn stranded_measurement(conn: &mut SqliteConnection) -> (Option<f64>, Option<String>) {
    sqlx::query_as("SELECT bpm, musical_key FROM tracks WHERE id = 't1'")
        .fetch_one(conn)
        .await
        .expect("t1 must still exist")
}

/// The developer's own dev-profile shape (architecture, Phase 18 amendments):
/// the full v1 chain plus the stranded `track_bpm_key` migration, previously
/// refusal #10. v2's `0003` creates the identical columns, so adoption now
/// verifies the schema and records `0003` as satisfied instead of refusing —
/// and the C++-measured values survive in place.
#[tokio::test]
async fn a_profile_carrying_the_stranded_bpm_key_migration_is_adopted() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    apply_stranded_bpm_key(&mut seeded).await;
    seed_stranded_measurements(&mut seeded).await;
    let before = row_counts(&mut seeded).await;
    drop(seeded);

    assert_eq!(
        open(&path).await,
        Adoption::Adopted {
            legacy: false,
            healed_disc_number: false,
            replayed: Vec::new(),
            satisfied: vec![3],
        },
        "the stranded migration must be honoured as `0003`, not replayed or refused"
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_scrobble_queue_is_usable(&mut conn).await;
    assert_rows_preserved(&before, &row_counts(&mut conn).await);

    // The dev profile's measurements survive in place — the whole point of
    // adopting rather than dropping and re-adding the columns.
    assert_eq!(
        stranded_measurement(&mut conn).await,
        (Some(84.9), Some("A minor".to_owned()))
    );

    // The drizzle ledger keeps all ten names, stranded one included: v2 leaves
    // that table truthful, and neither a shipped v1 nor the branch build finds
    // anything missing on rollback.
    let names = ledger_names(&mut conn).await;
    assert_eq!(names.len(), 10);
    assert!(names.contains(&STRANDED_NAME.to_owned()));
    drop(conn);

    // Reopening is the ordinary already-adopted no-op; the migrator validates
    // the stamped `0003` checksum like any other applied migration.
    assert_eq!(open(&path).await, Adoption::AlreadyAdopted);
}

/// The other stranded shape: a profile whose v1 chain stopped where the branch
/// forked — `query_indexes` (the shipped ninth migration, which shares the
/// `…08` number with the branch's) was never applied. Adoption must both
/// replay the real ninth migration and honour the stranded one.
#[tokio::test]
async fn a_branch_era_profile_missing_query_indexes_is_healed_and_adopted() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 8).await;
    seed_rows(&mut seeded).await;
    apply_stranded_bpm_key(&mut seeded).await;
    seed_stranded_measurements(&mut seeded).await;
    drop(seeded);

    assert_eq!(
        open(&path).await,
        Adoption::Adopted {
            legacy: false,
            healed_disc_number: false,
            replayed: vec!["20260101000008_query_indexes".to_owned()],
            satisfied: vec![3],
        },
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_eq!(
        stranded_measurement(&mut conn).await,
        (Some(84.9), Some("A minor".to_owned()))
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
            satisfied: Vec::new(),
        },
        "a database already on the current chain needs no DDL at all"
    );

    let mut conn = connect(&path).await;
    assert_adopted_invariants(&mut conn).await;
    assert_rows_preserved(&before, &row_counts(&mut conn).await);
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
            expected_sqlx_versions(),
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
    // `bpm` and `musical_key` are v2's own, from migration `0003`.
    let mut expected = vec![
        "album",
        "album_art",
        "album_artist",
        "artist",
        "bpm",
        "created_at",
        "disc_number",
        "duration",
        "file_path",
        "genre",
        "id",
        "is_favorite",
        "loudness_lufs",
        "musical_key",
        "play_count",
        "title",
        "track_number",
        "updated_at",
        "year",
    ];
    expected.sort_unstable();

    assert_eq!(column_names(&mut conn, "tracks").await, expected);
}
