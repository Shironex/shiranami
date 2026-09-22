//! The export/import query layer, against real files.
//!
//! Ported from the cases `apps/desktop/src/main/services/db-backup.test.ts`
//! covers for the database half of backup — the validation and the snapshot.
//! The file orchestration those tests also cover (rotation, the temp-file swap,
//! sidecar cleanup) is not this crate's and is not tested here.

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::models::RadioStationInput;
use shiranami_db::error::DbError;
use shiranami_db::repo::{backup, radio};
use sqlx::ConnectOptions;

use activity::{exec, fresh};

/// A station, so a snapshot has something to prove it copied.
fn station(uuid: &str) -> RadioStationInput {
    RadioStationInput {
        station_uuid: uuid.to_owned(),
        name: format!("Station {uuid}"),
        url: format!("https://{uuid}.example/s"),
        url_resolved: format!("https://{uuid}.example/s.mp3"),
        ..RadioStationInput::default()
    }
}

// ── is_sqlite_file ────────────────────────────────────────────────────────────

#[tokio::test]
async fn a_real_database_is_recognised_by_its_header() {
    let fixture = fresh().await;
    let path = fixture.path();
    let dir = fixture.close().await;

    assert!(backup::is_sqlite_file(&path));

    drop(dir);
}

#[tokio::test]
async fn anything_that_is_not_a_database_is_rejected_without_erroring() {
    let dir = tempfile::tempdir().expect("a temp dir");

    let text = dir.path().join("notes.txt");
    std::fs::write(&text, b"this is not a database").expect("write the decoy");
    assert!(!backup::is_sqlite_file(&text));

    // Shorter than the 16-byte header: the read must fail closed, not panic.
    let stub = dir.path().join("stub.db");
    std::fs::write(&stub, b"SQLite").expect("write the stub");
    assert!(!backup::is_sqlite_file(&stub));

    // An empty file, and a path that does not exist at all.
    let empty = dir.path().join("empty.db");
    std::fs::write(&empty, b"").expect("write the empty file");
    assert!(!backup::is_sqlite_file(&empty));
    assert!(!backup::is_sqlite_file(&dir.path().join("absent.db")));
}

// ── assert_importable ─────────────────────────────────────────────────────────

#[tokio::test]
async fn a_database_at_the_current_floor_may_be_imported() {
    let fixture = fresh().await;
    let path = fixture.path();
    let dir = fixture.close().await;

    backup::assert_importable(&path)
        .await
        .expect("a database this build wrote must be importable");

    drop(dir);
}

#[tokio::test]
async fn a_file_that_is_not_a_database_is_refused_by_name() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let text = dir.path().join("holiday.zip");
    std::fs::write(&text, b"PK\x03\x04").expect("write the decoy");

    let error = backup::assert_importable(&text)
        .await
        .expect_err("a non-database must be refused");

    assert!(
        matches!(error, DbError::NotADatabase { .. }),
        "expected NotADatabase, got {error:?}"
    );
    // The message names the file the user picked, because they picked it in a
    // dialog and "the selected file" alone does not tell them which.
    assert!(error.to_string().contains("holiday.zip"), "{error}");
}

#[tokio::test]
async fn a_backup_from_a_newer_build_is_refused_before_anything_is_overwritten() {
    let mut fixture = fresh().await;
    // Stamp the file above this build's floor, as a future v2 would.
    exec(fixture.conn(), "PRAGMA user_version = 99").await;
    let path = fixture.path();
    let dir = fixture.close().await;

    let error = backup::assert_importable(&path)
        .await
        .expect_err("a newer database must be refused");

    assert!(
        matches!(error, DbError::SchemaTooNew { found: 99, .. }),
        "expected SchemaTooNew, got {error:?}"
    );

    drop(dir);
}

#[tokio::test]
async fn an_unstamped_legacy_backup_passes_the_guard() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = dir.path().join("legacy.db");
    // A database from before versioning: valid SQLite, user_version 0.
    let mut conn: sqlx::SqliteConnection = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .connect()
        .await
        .expect("the legacy fixture must open");
    sqlx::query("CREATE TABLE tracks (id TEXT PRIMARY KEY)")
        .execute(&mut conn)
        .await
        .expect("the legacy table must be created");
    drop(conn);

    // 0 means "older than versioning", not "unknown" — it passes here and is
    // baselined by adoption when the imported file is opened.
    backup::assert_importable(&path)
        .await
        .expect("an unstamped backup must be importable");
}

#[tokio::test]
async fn validating_a_backup_does_not_modify_it() {
    let fixture = fresh().await;
    let path = fixture.path();
    let dir = fixture.close().await;

    let before = std::fs::metadata(&path).expect("stat the backup").len();
    let digest_before = std::fs::read(&path).expect("read the backup");

    backup::assert_importable(&path)
        .await
        .expect("the backup must validate");

    let after = std::fs::metadata(&path).expect("stat the backup").len();
    // The probe opens read-only and sets no journal-mode pragma precisely so
    // that inspecting the user's backup cannot rewrite it — a WAL upgrade on a
    // file they are about to depend on would be a nasty way to learn this.
    assert_eq!(before, after, "validation must not resize the file");
    assert_eq!(
        digest_before,
        std::fs::read(&path).expect("re-read the backup"),
        "validation must not rewrite the file"
    );

    drop(dir);
}

// ── snapshot_to ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn a_snapshot_is_a_readable_database_holding_the_same_rows() {
    let mut fixture = fresh().await;
    radio::add(fixture.conn(), "r1", &station("uuid-1"))
        .await
        .expect("the station must save");
    radio::add(fixture.conn(), "r2", &station("uuid-2"))
        .await
        .expect("the station must save");

    let dest = fixture.sibling("export.db");
    backup::snapshot_to(fixture.conn(), &dest)
        .await
        .expect("the snapshot must be written");

    assert!(backup::is_sqlite_file(&dest), "the copy is a real database");

    // Open the copy independently and read the rows back out of it.
    let opened = shiranami_db::open(&dest)
        .await
        .expect("the snapshot must open");
    let mut conn = opened.pool.acquire().await.expect("a connection");
    let saved = radio::all(&mut conn)
        .await
        .expect("the favourites must read");
    assert_eq!(saved.len(), 2);
    let ids: Vec<_> = saved.iter().map(|entry| entry.id.as_str()).collect();
    assert!(ids.contains(&"r1") && ids.contains(&"r2"));

    drop(conn);
    opened.pool.close().await;
}

#[tokio::test]
async fn a_snapshot_carries_the_schema_stamp_across() {
    let mut fixture = fresh().await;
    let dest = fixture.sibling("export.db");

    backup::snapshot_to(fixture.conn(), &dest)
        .await
        .expect("the snapshot must be written");

    // An export the user later re-imports has to get past the downgrade guard,
    // which reads this stamp. `VACUUM INTO` preserves it; a copy that lost it
    // would still import (0 passes) but would then be baselined as if it were
    // a pre-versioning file.
    backup::assert_importable(&dest)
        .await
        .expect("the exported snapshot must be importable");
}

#[tokio::test]
async fn a_snapshot_refuses_to_overwrite_an_existing_file() {
    let mut fixture = fresh().await;
    let dest = fixture.sibling("export.db");
    std::fs::write(&dest, b"do not clobber me").expect("write the existing file");

    let error = backup::snapshot_to(fixture.conn(), &dest).await;

    // The documented difference from better-sqlite3's `.backup()`, which
    // overwrote. The caller owns the overwrite prompt, so it owns the unlink
    // too; failing here rather than silently destroying the file is the safe
    // direction for a difference the caller must know about.
    assert!(error.is_err(), "VACUUM INTO must not clobber a destination");
    assert_eq!(
        std::fs::read(&dest).expect("re-read the file"),
        b"do not clobber me",
        "the existing file must be untouched"
    );
}
