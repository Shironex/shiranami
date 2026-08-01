//! What adoption does when it cannot prove the database is what it expects.
//!
//! Separated from the happy paths because the assertion is a different one. Up
//! there the question is "did the data survive"; down here it is "did we refuse
//! *before* writing anything". Architecture §3.1 step 7 is explicit that the
//! wrong answer to a migration problem is to helpfully continue into a fresh
//! empty database, and a refusal that has already half-written a ledger is only
//! marginally better than that.

#[path = "support/schema.rs"]
mod schema;
#[path = "support/v1.rs"]
mod v1;

use std::path::Path;

use shiranami_db::DbError;
use sqlx::SqliteConnection;

use schema::count;
use v1::{
    build_v1_database, connect, exec, has_table, seed_rows, set_user_version, write_drizzle_ledger,
};

/// Open, expecting a refusal.
async fn refusal(path: &Path) -> DbError {
    match shiranami_db::open(path).await {
        Ok(_) => panic!("adoption should have refused this database"),
        Err(error) => error,
    }
}

/// The refusal must not have left a sqlx ledger behind: its presence is what a
/// later run reads as "already adopted".
async fn assert_untouched(conn: &mut SqliteConnection) {
    assert!(
        !has_table(&mut *conn, "_sqlx_migrations").await,
        "a refused database must not carry a partial adoption"
    );
}

#[tokio::test]
async fn a_database_stamped_by_a_newer_build_is_refused() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    // A v1 that raised its compatibility floor, or a v2 from the future.
    set_user_version(&mut seeded, 9).await;
    drop(seeded);

    let error = refusal(&path).await;
    assert!(
        matches!(
            error,
            DbError::SchemaTooNew {
                found: 9,
                supported: 8
            }
        ),
        "got {error:?}"
    );

    let mut conn = connect(&path).await;
    assert_untouched(&mut conn).await;
    assert_eq!(count(&mut conn, "tracks").await, 3, "the library is intact");
}

#[tokio::test]
async fn a_ledger_naming_an_unknown_migration_is_refused() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    // v1 shipped a tenth migration after v2 froze its copy of the chain. v2
    // cannot know what it did, so it cannot claim its baseline still describes
    // this schema.
    exec(
        &mut seeded,
        "INSERT INTO `__drizzle_migrations` (hash, created_at, name, applied_at)
         VALUES ('x', 1767225609000, '20260101000009_something_new', '2026-09-01T00:00:00.000Z')",
    )
    .await;
    drop(seeded);

    let error = refusal(&path).await;
    assert!(
        matches!(&error, DbError::UnknownV1Migration { name, known: 9 }
            if name == "20260101000009_something_new"),
        "got {error:?}"
    );

    let mut conn = connect(&path).await;
    assert_untouched(&mut conn).await;
}

#[tokio::test]
async fn a_drizzle_0x_ledger_is_refused_rather_than_guessed_at() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    // drizzle 0.x's three-column ledger: no names, so nothing to match on
    // without reimplementing its hash-based upgrade path. No shipped Shiranami
    // release wrote one — see `adopt::ledger`.
    exec(
        &mut seeded,
        "DROP TABLE `__drizzle_migrations`;
         CREATE TABLE `__drizzle_migrations` (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at numeric
         );
         INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES ('x', 1767225600000)",
    )
    .await;
    drop(seeded);

    let error = refusal(&path).await;
    assert!(
        matches!(&error, DbError::UnsupportedLedger { reason } if reason.contains("drizzle 0.x")),
        "got {error:?}"
    );

    let mut conn = connect(&path).await;
    assert_untouched(&mut conn).await;
    assert_eq!(count(&mut conn, "tracks").await, 3);
}

/// A ledger that claims a schema the file does not have. Stamping the baseline
/// here would record a schema that is not there, and the failure would surface
/// as a missing table on the first query — after v2 had already written to the
/// file.
#[tokio::test]
async fn a_ledger_without_the_schema_it_claims_is_refused() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    write_drizzle_ledger(&mut seeded, 9).await;
    set_user_version(&mut seeded, 8).await;
    drop(seeded);

    let error = refusal(&path).await;
    assert!(
        matches!(&error, DbError::UnsupportedLedger { reason } if reason.contains("`tracks`")),
        "got {error:?}"
    );
}

#[tokio::test]
async fn a_half_finished_adoption_is_refused_rather_than_resumed() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    exec(
        &mut seeded,
        "CREATE TABLE _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );
        INSERT INTO _sqlx_migrations VALUES (1, 'baseline', CURRENT_TIMESTAMP, FALSE, X'00', 0)",
    )
    .await;
    drop(seeded);

    let error = refusal(&path).await;
    assert!(
        matches!(&error, DbError::LedgerConflict { reason } if reason.contains("failed")),
        "got {error:?}"
    );
}

/// The checksum is the whole reason a stamped row is trustworthy. A row
/// recorded by a build whose squash differed means this build cannot say what
/// schema the file has.
#[tokio::test]
async fn a_baseline_stamped_by_a_different_build_is_refused() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    exec(
        &mut seeded,
        "CREATE TABLE _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );
        INSERT INTO _sqlx_migrations
        VALUES (1, 'baseline', CURRENT_TIMESTAMP, TRUE, X'deadbeef', 0)",
    )
    .await;
    drop(seeded);

    let error = refusal(&path).await;
    assert!(
        matches!(&error, DbError::LedgerConflict { reason } if reason.contains("checksum")),
        "got {error:?}"
    );
}

#[tokio::test]
async fn a_damaged_database_is_refused_before_anything_is_written() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    // WAL keeps recent pages out of the main file, so the damage below would
    // land somewhere the reader never looks. Rollback journalling puts the
    // whole database in the one file this test corrupts.
    let mut seeded = connect(&path).await;
    exec(&mut seeded, "PRAGMA journal_mode = DELETE").await;
    build_v1_database(&mut seeded, 9).await;
    for index in 0..2_000 {
        exec(
            &mut seeded,
            &format!(
                "INSERT INTO tracks (id, file_path, title) \
                 VALUES ('t{index}', '/music/{index}.mp3', 'Track {index}')"
            ),
        )
        .await;
    }
    drop(seeded);

    let mut bytes = std::fs::read(&path).expect("the database file must be readable");
    assert!(bytes.len() > 16_384, "the fixture must span many pages");
    // Page 1 holds the file header and the schema, so leaving it intact keeps
    // the file openable — which is the case worth testing. Everything after it
    // is table and index data, and garbling all of it guarantees the b-tree
    // walk hits the damage rather than depending on which page a given SQLite
    // build happened to put a row on.
    let length = bytes.len();
    bytes[4_096..length].fill(0x5a);
    std::fs::write(&path, &bytes).expect("the corrupted file must be writable");

    let error = refusal(&path).await;
    assert!(
        matches!(&error, DbError::Corrupt { report } if !report.is_empty()),
        "got {error:?}"
    );
}

#[tokio::test]
async fn a_file_that_is_not_a_database_is_refused() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");
    std::fs::write(&path, b"this is a jpeg, actually").expect("the decoy must be writable");

    // Which variant this lands in is SQLite's call — the property under test is
    // that it is an error rather than a silently recreated empty library.
    let error = refusal(&path).await;
    assert!(
        matches!(error, DbError::Corrupt { .. } | DbError::Query { .. }),
        "got {error:?}"
    );
}
