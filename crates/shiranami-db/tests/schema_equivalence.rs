//! The proof that `0001_baseline.sql` is a faithful squash of v1's chain.
//!
//! This is the test the phase plan makes Phase 6 wait on, and the reason is
//! worth stating plainly. Adoption records the baseline as applied *without
//! running it*, against a database full of a real user's library. If the squash
//! and the drizzle chain describe different schemas, nothing fails: adoption
//! succeeds, the app starts, and every query from then on runs against a schema
//! that was never checked — until one hits a column that is not there, weeks
//! later, on a machine that is not ours (risk R6).
//!
//! Three comparisons, each closing a different gap:
//!
//! 1. **the baseline against the committed fixture** — the fixture is generated
//!    from `packages/database/drizzle/*/migration.sql` by
//!    `pnpm verify:db-baseline`, so this is v2's schema against v1's, with the
//!    node/`better-sqlite3` side of the port in the loop;
//! 2. **the same, structurally** — `pragma_table_info` and friends, which catch
//!    a difference in *meaning* that a text diff can normalize away;
//! 3. **the baseline against a live replay of the chain**, both built by the
//!    same bundled SQLite the app ships, which removes the possibility that
//!    comparison 1 only agrees because two different SQLite builds happened to
//!    disagree in matching ways.

#[path = "support/schema.rs"]
mod schema;
#[path = "support/v1.rs"]
mod v1;

use serde_json::Value;
use shiranami_db::MIGRATOR;
use sqlx::SqliteConnection;

use schema::{SchemaObject, fixture, normalize_sql, schema_objects, table_shape};
use v1::{V1_SQL, connect, exec, statements};

/// A database with nothing but `0001_baseline.sql` in it.
async fn baseline_database(directory: &tempfile::TempDir) -> SqliteConnection {
    let mut conn = connect(&directory.path().join("baseline.db")).await;

    MIGRATOR
        .run(&mut conn)
        .await
        .expect("the baseline migration must apply to an empty database");

    conn
}

/// A database built by replaying v1's nine migrations, in order.
async fn drizzle_database(directory: &tempfile::TempDir) -> SqliteConnection {
    let mut conn = connect(&directory.path().join("drizzle.db")).await;

    for (_, sql) in &V1_SQL {
        for statement in statements(sql) {
            exec(&mut conn, statement).await;
        }
    }

    conn
}

/// The fixture's `sqlite_master` listing, normalized the same way.
fn fixture_objects() -> Vec<SchemaObject> {
    fixture()["objects"]
        .as_array()
        .expect("the fixture must list schema objects")
        .iter()
        .map(|object| SchemaObject {
            kind: string(object, "type"),
            name: string(object, "name"),
            table: string(object, "tableName"),
            sql: object["sql"].as_str().map(normalize_sql),
        })
        .collect()
}

fn string(object: &Value, key: &str) -> String {
    object[key]
        .as_str()
        .unwrap_or_else(|| panic!("the fixture's `{key}` must be a string"))
        .to_owned()
}

/// Compare two schema listings object by object, so a failure names the table
/// that diverged instead of printing two forty-entry arrays.
fn assert_same_schema(expected: &[SchemaObject], actual: &[SchemaObject], what: &str) {
    let expected_names: Vec<&str> = expected.iter().map(|object| object.name.as_str()).collect();
    let actual_names: Vec<&str> = actual.iter().map(|object| object.name.as_str()).collect();

    assert_eq!(
        expected_names, actual_names,
        "{what}: the set of schema objects differs"
    );

    for (expected, actual) in expected.iter().zip(actual) {
        assert_eq!(
            expected.kind, actual.kind,
            "{what}: `{}` is a different kind of object",
            expected.name
        );
        assert_eq!(
            expected.table, actual.table,
            "{what}: `{}` belongs to a different table",
            expected.name
        );
        assert_eq!(
            expected.sql, actual.sql,
            "{what}: `{}` is defined differently",
            expected.name
        );
    }
}

#[tokio::test]
async fn the_baseline_reproduces_the_sqlite_master_v1_produces() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let mut conn = baseline_database(&directory).await;

    let expected = fixture_objects();
    let actual = schema_objects(&mut conn).await;

    assert!(
        !expected.is_empty(),
        "the fixture is empty — regenerate it with `pnpm verify:db-baseline --write`"
    );
    assert_same_schema(&expected, &actual, "baseline vs the v1 fixture");
}

#[tokio::test]
async fn the_baseline_reproduces_the_table_structure_v1_produces() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let mut conn = baseline_database(&directory).await;

    let fixture = fixture();
    let expected = fixture["tables"]
        .as_object()
        .expect("the fixture must describe every table");

    for (table, shape) in expected {
        let actual = table_shape(&mut conn, table).await;

        assert_eq!(
            shape, &actual,
            "`{table}` has a different structure than v1 gives it"
        );
    }
}

/// Comparison 1 crosses two SQLite builds — Node's, which generated the
/// fixture, and the one sqlx bundles. Comparison 3 stays inside sqlx's, so the
/// two together rule out an agreement that only holds because both sides were
/// wrong in the same way.
#[tokio::test]
async fn the_baseline_and_the_drizzle_chain_agree_on_one_engine() {
    let directory = tempfile::tempdir().expect("a temp dir");

    let mut squashed = baseline_database(&directory).await;
    let mut chained = drizzle_database(&directory).await;

    assert_same_schema(
        &schema_objects(&mut chained).await,
        &schema_objects(&mut squashed).await,
        "baseline vs a live replay of the drizzle chain",
    );

    for object in schema_objects(&mut chained).await {
        if object.kind != "table" {
            continue;
        }

        assert_eq!(
            table_shape(&mut chained, &object.name).await,
            table_shape(&mut squashed, &object.name).await,
            "`{}` has a different structure after the squash",
            object.name
        );
    }
}

/// The squash's other half of the contract: fresh installs run it, adopted
/// databases have it run against them by nothing — but a *re-run* has to be
/// harmless, because that is what makes a crashed first run safe to retry.
#[tokio::test]
async fn the_baseline_is_idempotent() {
    let directory = tempfile::tempdir().expect("a temp dir");
    let mut conn = baseline_database(&directory).await;

    let before = schema_objects(&mut conn).await;

    // Fed to the driver whole, comments and all, exactly as sqlx's migrator
    // feeds it — splitting it here would be testing the splitter.
    exec(&mut conn, include_str!("../migrations/0001_baseline.sql")).await;

    assert_same_schema(
        &before,
        &schema_objects(&mut conn).await,
        "the baseline re-run against a database that already has it",
    );
}
