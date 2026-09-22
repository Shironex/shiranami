//! `db:folders:*` against a real database.

#[path = "support/library.rs"]
mod library;

use shiranami_db::repo::folders;

use library::fresh;

#[tokio::test]
async fn add_inserts_a_folder_and_returns_the_row() {
    let mut library = fresh().await;

    let added = folders::add(library.conn(), "/home/user/Music")
        .await
        .expect("insert")
        .expect("a row");

    assert!(!added.id.is_empty(), "the id is generated app-side");
    assert_eq!(added.path, "/home/user/Music");
    assert_eq!(added.last_scanned, None, "a new folder is unscanned");
    assert!(!added.created_at.is_empty());
}

/// v1 read this table with no `ORDER BY`, so the settings list has always shown
/// insertion order. Sorting it here would visibly reshuffle an existing user's
/// folders on first launch.
#[tokio::test]
async fn get_all_returns_folders_in_insertion_order() {
    let mut library = fresh().await;

    for path in ["/music/zulu", "/music/alpha", "/music/mike"] {
        folders::add(library.conn(), path).await.expect("insert");
    }

    let all = folders::get_all(library.conn()).await.expect("read");

    assert_eq!(
        all.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(),
        vec!["/music/zulu", "/music/alpha", "/music/mike"]
    );
}

#[tokio::test]
async fn get_all_on_a_fresh_library_is_empty() {
    let mut library = fresh().await;

    assert!(
        folders::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

#[tokio::test]
async fn remove_deletes_a_folder_by_id() {
    let mut library = fresh().await;
    let added = folders::add(library.conn(), "/home/user/Music")
        .await
        .expect("insert")
        .expect("a row");

    folders::remove(library.conn(), &added.id)
        .await
        .expect("remove");

    assert!(
        folders::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

#[tokio::test]
async fn removing_an_unknown_folder_is_a_no_op() {
    let mut library = fresh().await;
    folders::add(library.conn(), "/home/user/Music")
        .await
        .expect("insert");

    folders::remove(library.conn(), "not-a-folder")
        .await
        .expect("remove");

    assert_eq!(
        folders::get_all(library.conn()).await.expect("read").len(),
        1
    );
}

/// `path` is `UNIQUE` and — unlike `db:tracks:add` — v1 did not soften the
/// conflict here, because adding a folder is a deliberate user action with a
/// visible outcome rather than a background race.
#[tokio::test]
async fn adding_the_same_path_twice_is_refused() {
    let mut library = fresh().await;
    folders::add(library.conn(), "/home/user/Music")
        .await
        .expect("insert");

    let again = folders::add(library.conn(), "/home/user/Music").await;

    assert!(again.is_err(), "the UNIQUE constraint stands");
    assert_eq!(
        folders::get_all(library.conn()).await.expect("read").len(),
        1
    );
}

#[tokio::test]
async fn update_scanned_stamps_the_folder_and_returns_the_row() {
    let mut library = fresh().await;
    let added = folders::add(library.conn(), "/home/user/Music")
        .await
        .expect("insert")
        .expect("a row");

    let scanned = folders::update_scanned(library.conn(), &added.id)
        .await
        .expect("stamp")
        .expect("a row");

    assert_eq!(scanned.id, added.id);
    assert!(scanned.last_scanned.is_some());
}

/// The format is a compatibility constraint, not a preference: v1 wrote
/// `new Date().toISOString()` into this column and a v1 build can still read
/// the file during the handover window.
#[tokio::test]
async fn update_scanned_writes_a_javascript_iso_8601_timestamp() {
    let mut library = fresh().await;
    let added = folders::add(library.conn(), "/home/user/Music")
        .await
        .expect("insert")
        .expect("a row");

    let stamp = folders::update_scanned(library.conn(), &added.id)
        .await
        .expect("stamp")
        .expect("a row")
        .last_scanned
        .expect("a timestamp");

    assert_eq!(stamp.len(), 24, "`2026-08-01T12:34:56.789Z` is 24 chars");
    assert_eq!(stamp.as_bytes()[10], b'T', "the date/time separator");
    assert_eq!(stamp.as_bytes()[19], b'.', "milliseconds are present");
    assert!(stamp.ends_with('Z'), "UTC, spelled the way v1 spelled it");

    // `created_at` keeps the other spelling — `datetime('now')`, second
    // resolution, a space separator — and both live in this one table.
    assert!(!added.created_at.contains('T'));
    assert_eq!(added.created_at.len(), 19);
}

#[tokio::test]
async fn update_scanned_on_an_unknown_id_returns_nothing() {
    let mut library = fresh().await;

    assert!(
        folders::update_scanned(library.conn(), "not-a-folder")
            .await
            .expect("stamp")
            .is_none()
    );
}
