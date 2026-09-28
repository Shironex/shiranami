//! The move cases of the reconciliation matrix that go beyond a plain move:
//! a copy, a retag followed by a move, and the accepted residual of files
//! dragged out of a folder that is left behind empty. Split from
//! `reconciliation.rs` (same harness, `support/reconcile.rs`) to keep each
//! module under the line cap.

#[path = "support/tree.rs"]
mod tree;

#[path = "support/reconcile.rs"]
mod reconcile;

use shiranami_db::repo::tracks;

use reconcile::{Library, Pass, reconcile, scan, sweep_missing, text};

#[tokio::test]
async fn a_copy_is_a_new_track_and_the_original_keeps_its_row() {
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");

    let original = tree::wav(music.path(), "Album/song.wav");
    tree::tag(&original, "A Song", "An Artist", "An Album");
    reconcile(library.conn(), &scan(music.path())).await;
    let original_id = tracks::get_all(library.conn())
        .await
        .expect("the library reads")[0]
        .id
        .clone();

    let copy = music.path().join("Backup").join("song.wav");
    std::fs::create_dir_all(copy.parent().expect("a parent")).expect("the fixture writes");
    std::fs::copy(&original, &copy).expect("the fixture copies");

    let pass = reconcile(library.conn(), &scan(music.path())).await;
    assert_eq!(pass, Pass { added: 1, moved: 0 });
    assert_eq!(sweep_missing(library.conn()).await, 0);

    let after = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    let kept = after
        .iter()
        .find(|track| track.id == original_id)
        .expect("the original row is untouched");
    assert_eq!(kept.file_path, text(&original));
    assert_eq!(after.len(), 2);
}

#[tokio::test]
async fn a_retagged_then_moved_file_is_still_followed() {
    // The in-app tag editor rewrites files, so the identity must not be a
    // hash of the whole file. Tags change here between the two scans, and
    // the file moves too.
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");

    let original = tree::wav(music.path(), "a/song.wav");
    tree::tag(&original, "Before", "An Artist", "An Album");
    reconcile(library.conn(), &scan(music.path())).await;
    let original_id = tracks::get_all(library.conn())
        .await
        .expect("the library reads")[0]
        .id
        .clone();

    tree::tag(&original, "After a much longer retag", "Someone", "Else");
    let moved = music.path().join("b").join("song.wav");
    std::fs::rename(
        original.parent().expect("a parent"),
        moved.parent().expect("a parent"),
    )
    .expect("the fixture moves");

    let pass = reconcile(library.conn(), &scan(music.path())).await;
    sweep_missing(library.conn()).await;

    assert_eq!(pass.moved, 1);
    let after = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].id, original_id);
    assert_eq!(after[0].file_path, text(&moved));
}

/// The accepted residual, end to end: a file dragged out of a folder that is
/// left behind empty cannot be told apart from a file under a leftover
/// (unmounted) mount point, so it is not followed. It becomes a new track and
/// the old row is swept, which is the behaviour before move detection.
#[tokio::test]
async fn files_moved_out_of_a_folder_left_empty_are_new_tracks() {
    let mut library = Library::fresh().await;
    let music = tempfile::tempdir().expect("a temp dir");

    let original = tree::wav(music.path(), "Old Folder/song.wav");
    tree::tag(&original, "A Song", "An Artist", "An Album");
    reconcile(library.conn(), &scan(music.path())).await;
    let original_id = tracks::get_all(library.conn())
        .await
        .expect("the library reads")[0]
        .id
        .clone();

    let moved = music.path().join("New Folder").join("song.wav");
    std::fs::create_dir_all(moved.parent().expect("a parent")).expect("the fixture writes");
    std::fs::rename(&original, &moved).expect("the fixture moves");

    let pass = reconcile(library.conn(), &scan(music.path())).await;
    let swept = sweep_missing(library.conn()).await;

    assert_eq!(pass, Pass { added: 1, moved: 0 });
    assert_eq!(swept, 1);
    let after = tracks::get_all(library.conn())
        .await
        .expect("the library reads");
    assert_eq!(after.len(), 1);
    assert_ne!(after[0].id, original_id);
}
