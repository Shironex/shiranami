//! `db:backup:*`, exercised against real temporary databases.
//!
//! Split from `db_backup.rs` and included with `#[path]` rather than left in
//! it: the two together run past the module-shape cap, and of the two halves the
//! tests are the one that can move without splitting a namespace across files.
//! `commands/mod.rs` is generated from the registry list, so a second `pub mod`
//! entry there would declare a namespace that does not exist.

use super::*;
use crate::state::tests::state_over;
use shiranami_core::error::codes;
use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::tracks;

/// Seed one track so an exported copy has something to prove it carried.
async fn seed(state: &AppState, title: &str) {
    let mut conn = state.conn().await.expect("acquire");
    tracks::add(
        &mut conn,
        &TrackCreateInput {
            file_path: format!("/music/{title}.mp3"),
            title: title.to_owned(),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("seed");
}

/// Titles currently in the live library.
async fn titles(state: &AppState) -> Vec<String> {
    let mut conn = state.conn().await.expect("acquire");
    tracks::get_all(&mut conn)
        .await
        .expect("read")
        .into_iter()
        .map(|track| track.title)
        .collect()
}

#[tokio::test]
async fn an_export_writes_a_database_that_carries_the_library() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    seed(&state, "Alpha").await;

    let destination = dir.path().join("export.db");
    let mut conn = state.conn().await.expect("acquire");
    backup::snapshot_to(&mut conn, &destination)
        .await
        .expect("snapshot");
    drop(conn);

    assert!(backup::is_sqlite_file(&destination));
    backup::assert_importable(&destination)
        .await
        .expect("the exported file is importable");
}

/// `VACUUM INTO` refuses an existing destination where v1's `.backup()`
/// overwrote one, so the export stages and renames. Asserted directly on
/// the repository so the reason the staging exists cannot quietly stop
/// being true.
#[tokio::test]
async fn a_snapshot_refuses_a_destination_that_already_exists() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    let destination = dir.path().join("taken.db");
    std::fs::write(&destination, b"in the way").expect("occupy the path");

    let mut conn = state.conn().await.expect("acquire");
    let refused = backup::snapshot_to(&mut conn, &destination).await;

    assert!(
        refused.is_err(),
        "if this ever starts succeeding, the staging dance in `db_backup_export` \
         is dead code rather than the overwrite behaviour v1 had"
    );
}

/// The guard that must run before anything is written. A file that is not a
/// database is refused on its header, with the live library untouched.
#[tokio::test]
async fn a_file_that_is_not_a_database_is_refused_before_any_overwrite() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    seed(&state, "Alpha").await;

    let not_a_database = dir.path().join("holiday.zip");
    std::fs::write(&not_a_database, b"PK\x03\x04 not a database").expect("write");

    assert!(backup::assert_importable(&not_a_database).await.is_err());
    assert_eq!(
        titles(&state).await,
        vec!["Alpha".to_owned()],
        "the live library must be untouched by a refused import"
    );
}

/// The pool really is replaceable, and a command taken after the swap sees
/// the new file. This is the property `db:backup:import` is built on and
/// the one a refactor of `AppState` would silently break.
#[tokio::test]
async fn replacing_the_pool_points_later_commands_at_the_new_database() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    seed(&state, "Original").await;

    // A second, independent database standing in for an imported file.
    let other = tempfile::tempdir().expect("a temp dir");
    let opened = shiranami_db::open(&other.path().join("shiranami.db"))
        .await
        .expect("open the replacement");
    {
        let mut conn = opened.pool.acquire().await.expect("acquire");
        tracks::add(
            &mut conn,
            &TrackCreateInput {
                file_path: "/music/imported.mp3".to_owned(),
                title: "Imported".to_owned(),
                ..TrackCreateInput::default()
            },
        )
        .await
        .expect("seed the replacement");
    }

    state.install_pool(opened.pool).close().await;

    assert_eq!(titles(&state).await, vec!["Imported".to_owned()]);
}

/// Write a standalone database carrying one track, standing in for a file
/// the user picked in a dialog. Returns its path and the directory holding
/// it, which the caller must keep alive.
async fn a_library_file(title: &str) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("a temp dir");
    let path = dir.path().join("backup.db");
    let opened = shiranami_db::open(&path).await.expect("open");
    {
        let mut conn = opened.pool.acquire().await.expect("acquire");
        tracks::add(
            &mut conn,
            &TrackCreateInput {
                file_path: format!("/music/{title}.mp3"),
                title: title.to_owned(),
                ..TrackCreateInput::default()
            },
        )
        .await
        .expect("seed");
    }
    opened.pool.close().await;

    (dir, path)
}

/// The whole feature, end to end: a real backup file replaces a real live
/// library, and the reopened pool serves the imported rows.
#[tokio::test]
async fn importing_replaces_the_live_library_and_reopens_it() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    seed(&state, "Original").await;
    let live = live_database_path(&state);

    let (_backup_dir, source) = a_library_file("Imported").await;

    let (swapped, reopened) = replace_library(source, live, state.pool()).await;
    swapped.expect("the file swap succeeds");
    let opened = reopened.expect("the database reopens");
    state.install_pool(opened.pool).close().await;

    assert_eq!(titles(&state).await, vec!["Imported".to_owned()]);
}

/// The pre-import snapshot really is written, and lands where v1 put it.
/// It is the only copy of the library the user is about to overwrite.
#[tokio::test]
async fn importing_snapshots_the_library_it_is_about_to_replace() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    seed(&state, "Original").await;
    let live = live_database_path(&state);

    let (_backup_dir, source) = a_library_file("Imported").await;
    let (swapped, reopened) = replace_library(source, live, state.pool()).await;
    swapped.expect("swap");
    state
        .install_pool(reopened.expect("reopen").pool)
        .close()
        .await;

    let snapshots: Vec<PathBuf> = std::fs::read_dir(dir.path().join(SNAPSHOT_DIR))
        .expect("the snapshot directory exists")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    assert_eq!(snapshots.len(), 1, "exactly one snapshot was taken");
    assert!(backup::is_sqlite_file(&snapshots[0]));
}

/// A backup stamped by a newer build is refused **before** the overwrite, so
/// the working library survives. v1's comment records learning this the
/// explicit way: checking afterwards destroys the library and then tells the
/// user the import was refused.
#[tokio::test]
async fn a_newer_schema_backup_is_refused_with_the_live_library_intact() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;
    seed(&state, "Original").await;
    let live = live_database_path(&state);

    let (_backup_dir, source) = a_library_file("FromTheFuture").await;
    {
        let opened = shiranami_db::open(&source).await.expect("open the backup");
        let mut conn = opened.pool.acquire().await.expect("acquire");
        sqlx::query("PRAGMA user_version = 99999")
            .execute(&mut *conn)
            .await
            .expect("stamp a future schema");
        drop(conn);
        opened.pool.close().await;
    }

    let (swapped, reopened) = replace_library(source, live, state.pool()).await;

    swapped.expect("no file was touched, so the swap step reports success");
    let Err(error) = reopened else {
        panic!("the candidate must be refused");
    };
    assert!(
        matches!(error, shiranami_db::DbError::SchemaTooNew { .. }),
        "expected a downgrade refusal, got {error}"
    );

    // The live pool was never closed on this path, so the library is still
    // readable and still holds what it held.
    assert_eq!(titles(&state).await, vec!["Original".to_owned()]);
}

/// The live path is read from the pool, not re-derived from the app data
/// directory — otherwise this very test would import over a real library.
#[tokio::test]
async fn the_live_path_comes_from_the_pool_and_not_from_the_app_directory() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let state = state_over(dir.path()).await;

    assert_eq!(live_database_path(&state), dir.path().join("shiranami.db"));
}

#[test]
fn a_relative_or_empty_path_is_a_bad_request() {
    for raw in ["", "relative/backup.db", "backup.db"] {
        let error = validated_path(raw, "destination").expect_err("`{raw}` is refused");
        assert_eq!(error.code, codes::validation::BAD_REQUEST);
    }
}

#[test]
fn an_absolute_path_passes() {
    let absolute = if cfg!(windows) {
        r"C:\backups\library.db"
    } else {
        "/backups/library.db"
    };

    assert!(validated_path(absolute, "destination").is_ok());
}

/// The staged name is a sibling of the destination, so the rename that
/// follows stays on one filesystem and is therefore atomic.
#[test]
fn the_staging_path_is_a_sibling_of_its_destination() {
    let destination = Path::new("/backups/library.db");
    let staged = staging_path(destination);

    assert_eq!(staged.parent(), destination.parent());
    assert_eq!(staged, Path::new("/backups/library.db.part"));
}

/// The three states v1's renderer branches on. Pinned as serialization,
/// because the shim forwards this object straight through.
#[test]
fn the_result_shapes_are_v1s() {
    let done = serde_json::to_value(DbExportResult {
        success: true,
        path: Some("/backups/library.db".to_owned()),
        error: None,
    })
    .expect("serialize");
    assert_eq!(done["success"], true);
    assert_eq!(done["path"], "/backups/library.db");

    let failed = serde_json::to_value(DbExportResult::failed("disk full")).expect("serialize");
    assert_eq!(failed["success"], false);
    assert_eq!(failed["error"], "disk full");

    let refused =
        serde_json::to_value(DbImportResult::failed("not a database")).expect("serialize");
    assert_eq!(refused["success"], false);
    assert_eq!(refused["error"], "not a database");
    assert!(
        refused.get("path").is_none(),
        "v1's import result carries no path"
    );
}
