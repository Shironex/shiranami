//! Adoption of profiles carrying the stranded `track_bpm_key` dev migration.
//!
//! The unmerged `feat/native-bpm-key-addon` branch applied
//! `20260101000008_track_bpm_key` to real databases — the developer's own v1
//! profile among them — and until v2 grew `0003_track_bpm_key.sql` the only
//! safe answer was refusal #10 (`UnknownV1Migration`). These tests pin the
//! accepting path: the stranded name is recognised, its schema verified, and
//! v2's identical `0003` recorded as satisfied, with the C++-measured values
//! surviving in place. The lying-ledger refusal lives with the other refusals
//! in `adoption_refusals.rs`; the ordinary shapes stay in `adoption.rs`.

#[path = "support/schema.rs"]
mod schema;
#[path = "support/v1.rs"]
mod v1;

use std::path::Path;

use shiranami_db::{Adoption, MIGRATOR, SCHEMA_FLOOR};
use sqlx::SqliteConnection;

use schema::{column_names, row_counts};
use v1::{build_v1_database, connect, exec, has_table, seed_rows, user_version};

/// The addon branch's migration name, exactly as its drizzle folder spelt it.
const STRANDED_NAME: &str = "20260101000008_track_bpm_key";

/// Open through the crate's real boot path.
async fn open(path: &Path) -> Adoption {
    let opened = shiranami_db::open(path)
        .await
        .expect("the database must open");
    let adoption = opened.adoption.clone();
    opened.pool.close().await;
    adoption
}

/// Names in `__drizzle_migrations`, which adoption must leave truthful.
async fn ledger_names(conn: &mut SqliteConnection) -> Vec<String> {
    sqlx::query_scalar("SELECT name FROM `__drizzle_migrations` ORDER BY id")
        .fetch_all(conn)
        .await
        .expect("the drizzle ledger must be readable")
}

/// Apply the stranded dev migration the way the branch's drizzle did: the two
/// `ALTER TABLE`s plus a ledger row. The SQL is the branch's `migration.sql`
/// verbatim.
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

    // The C++-measured values a dev profile carries in those columns.
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

/// What every successful stranded adoption must leave behind: the whole sqlx
/// chain recorded, the frozen floor, `0003`'s columns present, `0002`'s table
/// really created, and a truthful ten-name drizzle ledger.
async fn assert_stranded_invariants(conn: &mut SqliteConnection) {
    let versions: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&mut *conn)
            .await
            .expect("the sqlx ledger must be readable");
    let expected: Vec<i64> = MIGRATOR.iter().map(|migration| migration.version).collect();
    assert_eq!(versions, expected, "the whole sqlx chain must be recorded");

    assert_eq!(user_version(&mut *conn).await, SCHEMA_FLOOR);

    let columns = column_names(&mut *conn, "tracks").await;
    for column in ["bpm", "musical_key"] {
        assert!(columns.contains(&column.to_owned()), "missing `{column}`");
    }
    assert!(
        has_table(&mut *conn, "scrobble_queue").await,
        "`0002` must have run for real — a stamp would have skipped its DDL"
    );

    let names = ledger_names(&mut *conn).await;
    assert_eq!(names.len(), 10, "all ten drizzle names stay for rollback");
    assert!(names.contains(&STRANDED_NAME.to_owned()));

    assert_eq!(
        stranded_measurement(&mut *conn).await,
        (Some(84.9), Some("A minor".to_owned())),
        "the dev profile's measurements survive in place — the whole point of \
         adopting rather than dropping and re-adding the columns"
    );
}

/// The developer's own dev-profile shape (architecture, Phase 18 amendments):
/// the full v1 chain plus the stranded migration, previously refusal #10.
#[tokio::test]
async fn a_profile_carrying_the_stranded_bpm_key_migration_is_adopted() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let path = directory.path().join("shiranami.db");

    let mut seeded = connect(&path).await;
    build_v1_database(&mut seeded, 9).await;
    seed_rows(&mut seeded).await;
    apply_stranded_bpm_key(&mut seeded).await;
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
    assert_stranded_invariants(&mut conn).await;

    // Every table the database had holds exactly the rows it held.
    for (table, rows) in &before {
        let found = row_counts(&mut conn).await;
        let after = found
            .iter()
            .find(|(name, _)| name == table)
            .unwrap_or_else(|| panic!("`{table}` disappeared during adoption"));
        assert_eq!(after.1, *rows, "`{table}` changed row count");
    }
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
    assert_stranded_invariants(&mut conn).await;
}
