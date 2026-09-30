//! The move-aware import (`tracks::import_many`) and the hash backfill reads.
//!
//! Paths here are never real files. The repository does no file I/O: the
//! caller passes the set of candidate paths it verified as moved away, so each
//! test states outright which old paths are "gone"; the real-filesystem
//! version of the same story lives in `shiranami-library`'s
//! `tests/reconciliation.rs`.

#[path = "support/library.rs"]
mod library;

use std::collections::HashSet;

use shiranami_db::repo::tracks::IdentifiedTrack;
use shiranami_db::repo::{playlist_tracks, tracks};
use sqlx::SqliteConnection;

use library::{fresh, played, playlist, playlist_track_ids, set_created_at, set_play_count, track};

fn identified(file_path: &str, title: &str, hash: Option<&str>) -> IdentifiedTrack {
    IdentifiedTrack {
        input: track(file_path, title),
        content_hash: hash.map(str::to_owned),
    }
}

/// The candidate paths a caller verified as moved away.
fn gone(paths: &[&str]) -> HashSet<String> {
    paths.iter().map(|path| (*path).to_owned()).collect()
}

/// Import one file with a hash and return its id.
async fn seed(conn: &mut SqliteConnection, path: &str, title: &str, hash: &str) -> String {
    let imported = tracks::import_many(
        conn,
        &[identified(path, title, Some(hash))],
        &HashSet::new(),
    )
    .await
    .expect("the seed imports");
    imported.added[0].id.clone()
}

async fn stored_hash(conn: &mut SqliteConnection, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT content_hash FROM tracks WHERE id = ?1")
        .bind(id)
        .fetch_one(&mut *conn)
        .await
        .expect("the row reads")
}

async fn history_rows(conn: &mut SqliteConnection, id: &str) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM play_history WHERE track_id = ?1")
        .bind(id)
        .fetch_one(&mut *conn)
        .await
        .expect("the history counts")
}

#[tokio::test]
async fn an_import_stores_the_hash_it_was_given() {
    let mut library = fresh().await;

    let id = seed(library.conn(), "/music/a.mp3", "A", "a1:aaa").await;

    assert_eq!(
        stored_hash(library.conn(), &id).await.as_deref(),
        Some("a1:aaa")
    );
}

#[tokio::test]
async fn a_moved_track_keeps_its_id_plays_favourite_playlists_and_history() {
    let mut library = fresh().await;
    let id = seed(library.conn(), "/old/song.mp3", "Song", "a1:song").await;
    set_play_count(library.conn(), &id, 7).await;
    tracks::toggle_favorite(library.conn(), &id)
        .await
        .expect("toggle");
    tracks::set_bpm_key(library.conn(), &id, Some(82.0), Some("A minor"))
        .await
        .expect("analysis");
    let list = playlist(library.conn(), "Late night").await;
    playlist_tracks::add_track(library.conn(), &list, &id)
        .await
        .expect("membership");
    played(library.conn(), &id, 2, "library").await;

    let imported = tracks::import_many(
        library.conn(),
        &[identified("/new/song.mp3", "Song", Some("a1:song"))],
        &gone(&["/old/song.mp3"]),
    )
    .await
    .expect("the import runs");

    assert!(imported.added.is_empty(), "nothing new was inserted");
    assert_eq!(imported.moved.len(), 1);
    let moved = &imported.moved[0];
    assert_eq!(moved.id, id, "the same row, re-pointed");
    assert_eq!(moved.file_path, "/new/song.mp3");
    assert_eq!(
        moved.play_count,
        Some(7),
        "the moved track keeps its play count"
    );
    assert_eq!(moved.is_favorite, Some(true));
    assert_eq!(moved.bpm, Some(82.0));
    assert_eq!(moved.musical_key.as_deref(), Some("A minor"));

    assert_eq!(
        playlist_track_ids(library.conn(), &list).await,
        vec![id.clone()]
    );
    assert_eq!(history_rows(library.conn(), &id).await, 1);
    assert_eq!(
        tracks::get_all(library.conn()).await.expect("read").len(),
        1
    );
}

#[tokio::test]
async fn a_copy_is_inserted_because_the_original_is_still_on_disk() {
    let mut library = fresh().await;
    let id = seed(library.conn(), "/music/song.mp3", "Song", "a1:song").await;

    let imported = tracks::import_many(
        library.conn(),
        &[identified("/backup/song.mp3", "Song", Some("a1:song"))],
        &HashSet::new(),
    )
    .await
    .expect("the import runs");

    assert!(imported.moved.is_empty());
    assert_eq!(imported.added.len(), 1);
    assert_ne!(imported.added[0].id, id);
    assert_eq!(
        stored_hash(library.conn(), &imported.added[0].id)
            .await
            .as_deref(),
        Some("a1:song"),
        "the copy carries the same identity"
    );
    assert_eq!(
        tracks::get_all(library.conn()).await.expect("read").len(),
        2
    );
}

#[tokio::test]
async fn an_ambiguous_match_prefers_the_same_file_name_then_the_oldest_row() {
    let mut library = fresh().await;
    let older = seed(library.conn(), "/a/one.mp3", "One", "a1:dup").await;
    let named = seed(library.conn(), "/b/two.mp3", "Two", "a1:dup").await;
    let newest = seed(library.conn(), "/c/three.mp3", "Three", "a1:dup").await;
    set_created_at(library.conn(), &older, "2025-01-01 00:00:00").await;
    set_created_at(library.conn(), &named, "2025-06-01 00:00:00").await;
    set_created_at(library.conn(), &newest, "2026-01-01 00:00:00").await;
    let gone = gone(&["/a/one.mp3", "/b/two.mp3", "/c/three.mp3"]);

    // A file named like one of them goes to that one, though it is not oldest.
    let first = tracks::import_many(
        library.conn(),
        &[identified("/new/two.mp3", "Two", Some("a1:dup"))],
        &gone,
    )
    .await
    .expect("the import runs");
    assert_eq!(first.moved[0].id, named);

    // With no name to go by, the oldest remaining row wins.
    let second = tracks::import_many(
        library.conn(),
        &[identified("/new/renamed.mp3", "X", Some("a1:dup"))],
        &gone,
    )
    .await
    .expect("the import runs");
    assert_eq!(second.moved[0].id, older);
}

#[tokio::test]
async fn two_moved_copies_in_one_batch_claim_two_rows() {
    let mut library = fresh().await;
    let one = seed(library.conn(), "/old/a/song.mp3", "Song", "a1:dup").await;
    let two = seed(library.conn(), "/old/b/song.mp3", "Song", "a1:dup").await;

    let imported = tracks::import_many(
        library.conn(),
        &[
            identified("/new/a/song.mp3", "Song", Some("a1:dup")),
            identified("/new/b/song.mp3", "Song", Some("a1:dup")),
            identified("/new/c/song.mp3", "Song", Some("a1:dup")),
        ],
        &gone(&["/old/a/song.mp3", "/old/b/song.mp3"]),
    )
    .await
    .expect("the import runs");

    let moved: HashSet<String> = imported.moved.iter().map(|t| t.id.clone()).collect();
    assert_eq!(moved, HashSet::from([one, two]));
    assert_eq!(
        imported.added.len(),
        1,
        "a third copy has nothing left to claim"
    );
    assert_eq!(imported.added[0].file_path, "/new/c/song.mp3");
}

#[tokio::test]
async fn a_path_already_in_the_library_is_neither_moved_nor_duplicated() {
    let mut library = fresh().await;
    seed(library.conn(), "/old/song.mp3", "Song", "a1:song").await;
    let occupant = seed(library.conn(), "/new/song.mp3", "Other", "a1:other").await;

    let imported = tracks::import_many(
        library.conn(),
        &[identified("/new/song.mp3", "Song", Some("a1:song"))],
        &gone(&["/old/song.mp3"]),
    )
    .await
    .expect("the import runs without a UNIQUE violation");

    assert_eq!(imported, tracks::Imported::default());
    let single = tracks::import(
        library.conn(),
        &identified("/new/song.mp3", "Song", Some("a1:song")),
        &gone(&["/old/song.mp3"]),
    )
    .await
    .expect("import")
    .expect("a row");
    assert_eq!(
        single.id, occupant,
        "the single import is idempotent on path"
    );
}

#[tokio::test]
async fn an_unhashed_file_or_row_is_never_matched() {
    let mut library = fresh().await;
    let legacy = library::add_track(library.conn(), "/old/legacy.mp3", "Legacy").await;

    let imported = tracks::import_many(
        library.conn(),
        &[
            identified("/new/legacy.mp3", "Legacy", Some("a1:legacy")),
            identified("/new/unreadable.mp3", "Unreadable", None),
        ],
        &gone(&["/old/legacy.mp3"]),
    )
    .await
    .expect("the import runs");

    assert!(imported.moved.is_empty());
    assert_eq!(imported.added.len(), 2);
    assert!(
        tracks::get(library.conn(), &legacy)
            .await
            .expect("read")
            .is_some()
    );
}

#[tokio::test]
async fn a_re_point_takes_the_new_name_only_for_a_title_the_old_name_gave() {
    let mut library = fresh().await;
    let untagged = seed(
        library.conn(),
        "/old/track 01.mp3",
        "track 01",
        "a1:untagged",
    )
    .await;
    let tagged = seed(library.conn(), "/old/x.mp3", "Real Title", "a1:tagged").await;

    let imported = tracks::import_many(
        library.conn(),
        &[
            identified("/new/Intro.mp3", "Intro", Some("a1:untagged")),
            identified("/new/y.mp3", "y", Some("a1:tagged")),
        ],
        &gone(&["/old/track 01.mp3", "/old/x.mp3"]),
    )
    .await
    .expect("the import runs");

    let by_id = |id: &str| {
        imported
            .moved
            .iter()
            .find(|t| t.id == id)
            .expect("moved")
            .title
            .clone()
    };
    assert_eq!(by_id(&untagged), "Intro");
    assert_eq!(by_id(&tagged), "Real Title");
}

#[tokio::test]
async fn the_backfill_pages_past_rows_it_could_not_hash_and_never_overwrites() {
    let mut library = fresh().await;
    let a = library::add_track(library.conn(), "/music/a.mp3", "A").await;
    let b = library::add_track(library.conn(), "/music/b.mp3", "B").await;
    let hashed = seed(library.conn(), "/music/c.mp3", "C", "a1:c").await;

    let page = tracks::unhashed(library.conn(), 0, 1).await.expect("read");
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].id, a);
    let next = tracks::unhashed(library.conn(), page[0].rowid, 10)
        .await
        .expect("read");
    assert_eq!(
        next.iter().map(|row| row.id.clone()).collect::<Vec<_>>(),
        vec![b.clone()],
        "the hashed row is not offered"
    );

    let written = tracks::set_content_hashes(
        library.conn(),
        &[
            measured(&b, "/music/b.mp3", "a1:b"),
            measured(&hashed, "/music/c.mp3", "a1:stale"),
        ],
    )
    .await
    .expect("write");
    assert_eq!(written, 1);
    assert_eq!(
        stored_hash(library.conn(), &b).await.as_deref(),
        Some("a1:b")
    );
    assert_eq!(
        stored_hash(library.conn(), &hashed).await.as_deref(),
        Some("a1:c")
    );
}

/// A row whose path changed between the backfill's read and its write keeps
/// its `NULL`: the hash describes the old file, not the one the row names now.
#[tokio::test]
async fn the_backfill_skips_a_row_whose_path_changed_since_it_was_hashed() {
    let mut library = fresh().await;
    let moved = library::add_track(library.conn(), "/music/new.mp3", "Moved").await;

    let written = tracks::set_content_hashes(
        library.conn(),
        &[measured(&moved, "/music/old.mp3", "a1:old")],
    )
    .await
    .expect("write");

    assert_eq!(written, 0);
    assert_eq!(stored_hash(library.conn(), &moved).await, None);
}

fn measured(id: &str, file_path: &str, hash: &str) -> tracks::MeasuredHash {
    tracks::MeasuredHash {
        id: id.to_owned(),
        file_path: file_path.to_owned(),
        hash: hash.to_owned(),
    }
}

/// The add-folder, download and share imports pass no verified set: a file
/// matching a missing row is still inserted, never re-pointed.
#[tokio::test]
async fn without_a_verified_gone_set_nothing_is_re_pointed() {
    let mut library = fresh().await;
    let id = seed(library.conn(), "/nas/song.mp3", "Song", "a1:song").await;

    let imported = tracks::import_many(
        library.conn(),
        &[identified("/laptop/song.mp3", "Song", Some("a1:song"))],
        &HashSet::new(),
    )
    .await
    .expect("the import runs");

    assert!(imported.moved.is_empty());
    assert_eq!(imported.added.len(), 1);
    let original = tracks::get(library.conn(), &id)
        .await
        .expect("read")
        .expect("the original row is untouched");
    assert_eq!(original.file_path, "/nas/song.mp3");
}

#[tokio::test]
async fn candidate_paths_lists_every_row_carrying_a_hash() {
    let mut library = fresh().await;
    seed(library.conn(), "/a/one.mp3", "One", "a1:x").await;
    seed(library.conn(), "/b/two.mp3", "Two", "a1:x").await;
    seed(library.conn(), "/c/other.mp3", "Other", "a1:y").await;

    let mut paths = tracks::candidate_paths(library.conn(), &["a1:x".to_owned()])
        .await
        .expect("read");
    paths.sort();

    assert_eq!(
        paths,
        vec!["/a/one.mp3".to_owned(), "/b/two.mp3".to_owned()]
    );
}

/// The sweep race: the rescan checked `/old/song.mp3`, found it missing, and
/// meanwhile an import re-pointed the row at `/new/song.mp3`. The delete names
/// the path it checked, so it must refuse the re-pointed row.
#[tokio::test]
async fn a_sweep_never_deletes_a_row_re_pointed_since_it_checked() {
    let mut library = fresh().await;
    let moved = seed(library.conn(), "/old/song.mp3", "Song", "a1:song").await;
    let stale = seed(library.conn(), "/old/gone.mp3", "Gone", "a1:gone").await;
    tracks::import_many(
        library.conn(),
        &[identified("/new/song.mp3", "Song", Some("a1:song"))],
        &gone(&["/old/song.mp3"]),
    )
    .await
    .expect("the concurrent import re-points");

    let removed = tracks::remove_unmoved(
        library.conn(),
        &[
            (moved.clone(), "/old/song.mp3".to_owned()),
            (stale.clone(), "/old/gone.mp3".to_owned()),
        ],
    )
    .await
    .expect("the sweep runs");

    assert_eq!(removed, vec![stale.clone()]);
    assert!(
        tracks::get(library.conn(), &moved)
            .await
            .expect("read")
            .is_some()
    );
    assert!(
        tracks::get(library.conn(), &stale)
            .await
            .expect("read")
            .is_none()
    );
}
