//! `db:tracks:*` against a real database.
//!
//! The ported cases from v1's `database.integration.test.ts`, plus the ones
//! that suite could not express because drizzle made them unreachable — the
//! three-state patch semantics chief among them.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::TrackCreateInput;
use shiranami_db::repo::tracks;

use library::{add_track, add_tracks, fresh, set_created_at, track};

// ── reads ─────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn get_all_returns_the_newest_first() {
    let mut library = fresh().await;

    let older = add_track(library.conn(), "/music/older.mp3", "Older").await;
    let newer = add_track(library.conn(), "/music/newer.mp3", "Newer").await;
    set_created_at(library.conn(), &older, "2026-01-01 00:00:00").await;
    set_created_at(library.conn(), &newer, "2026-06-01 00:00:00").await;

    let all = tracks::get_all(library.conn()).await.expect("read");

    assert_eq!(
        all.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
        vec![newer.as_str(), older.as_str()]
    );
}

/// The tie-break v1 added deliberately: a folder scan stamps a whole import
/// with one `created_at`, and without `rowid` the order inside it is the
/// planner's choice.
#[tokio::test]
async fn get_all_breaks_ties_on_insertion_order() {
    let mut library = fresh().await;

    let ids = add_tracks(library.conn(), "same-second", 5).await;
    for id in &ids {
        set_created_at(library.conn(), id, "2026-03-01 12:00:00").await;
    }

    let all = tracks::get_all(library.conn()).await.expect("read");

    assert_eq!(all.iter().map(|t| t.id.clone()).collect::<Vec<_>>(), ids);
}

#[tokio::test]
async fn get_all_on_an_empty_library_is_empty() {
    let mut library = fresh().await;

    assert!(
        tracks::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

// ── add ───────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn add_inserts_a_track_and_returns_the_row_with_a_generated_id() {
    let mut library = fresh().await;

    let added = tracks::add(library.conn(), &track("/music/new.mp3", "New Song"))
        .await
        .expect("insert")
        .expect("a row");

    assert!(!added.id.is_empty(), "the id is generated app-side");
    assert_eq!(added.title, "New Song");
    assert_eq!(added.artist.as_deref(), Some("Test Artist"));
    assert_eq!(added.play_count, Some(0), "the column default applies");
    assert_eq!(added.is_favorite, Some(false));

    let all = tracks::get_all(library.conn()).await.expect("read");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, added.id);
}

/// The renderer's import is a non-atomic `exists()` → `add()` across two calls,
/// so the loser of that race must get the existing row, not a constraint error.
#[tokio::test]
async fn add_is_idempotent_on_the_file_path() {
    let mut library = fresh().await;

    let first = tracks::add(library.conn(), &track("/music/dupe.mp3", "First"))
        .await
        .expect("insert")
        .expect("a row");

    let second = tracks::add(library.conn(), &track("/music/dupe.mp3", "Second"))
        .await
        .expect("the duplicate must not error")
        .expect("a row");

    assert_eq!(second.id, first.id);
    assert_eq!(second.title, "First", "the first insert wins");
    assert_eq!(
        tracks::get_all(library.conn()).await.expect("read").len(),
        1
    );
}

/// The documented deviation: [`TrackCreateInput`] has no absent state, so an
/// unset optional writes `NULL` rather than falling to the column default.
#[tokio::test]
async fn an_unset_optional_is_stored_as_null() {
    let mut library = fresh().await;

    let added = tracks::add(
        library.conn(),
        &TrackCreateInput {
            file_path: "/music/untagged.mp3".to_owned(),
            title: "Untagged".to_owned(),
            ..TrackCreateInput::default()
        },
    )
    .await
    .expect("insert")
    .expect("a row");

    assert_eq!(added.artist, None);
    assert_eq!(added.album, None);
    assert_eq!(added.genre, None);
    assert_eq!(added.year, None);
}

// ── add_many ──────────────────────────────────────────────────────────────────

#[tokio::test]
async fn add_many_inserts_a_small_batch_and_returns_every_row() {
    let mut library = fresh().await;

    let ids = add_tracks(library.conn(), "batch", 5).await;

    assert_eq!(ids.len(), 5);
    assert_eq!(
        tracks::get_all(library.conn()).await.expect("read").len(),
        5
    );
}

#[tokio::test]
async fn add_many_spans_the_chunk_boundary() {
    let library = fresh().await;

    for count in [100, 250] {
        let mut library = fresh().await;
        let ids = add_tracks(library.conn(), "large", count).await;

        assert_eq!(ids.len(), count);
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), count, "every generated id is distinct");
        assert_eq!(
            tracks::get_all(library.conn()).await.expect("read").len(),
            count
        );
    }

    drop(library);
}

#[tokio::test]
async fn add_many_handles_an_empty_batch() {
    let mut library = fresh().await;

    assert!(
        tracks::add_many(library.conn(), &[])
            .await
            .expect("insert")
            .is_empty()
    );
}

/// The returned rows are the ones the caller should add to the in-memory
/// library, so a duplicate is skipped rather than echoed.
#[tokio::test]
async fn add_many_returns_only_the_rows_that_landed() {
    let mut library = fresh().await;

    add_track(library.conn(), "/music/already.mp3", "Already").await;

    let inserted = tracks::add_many(
        library.conn(),
        &[
            track("/music/already.mp3", "Duplicate"),
            track("/music/genuinely-new.mp3", "New"),
        ],
    )
    .await
    .expect("insert");

    assert_eq!(inserted.len(), 1);
    assert_eq!(inserted[0].title, "New");
    assert_eq!(
        tracks::get_all(library.conn()).await.expect("read").len(),
        2
    );
}

// ── remove ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn remove_deletes_one_track() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/doomed.mp3", "Doomed").await;

    tracks::remove(library.conn(), &id).await.expect("remove");

    assert!(
        tracks::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

#[tokio::test]
async fn remove_many_deletes_in_chunks_and_tolerates_an_empty_list() {
    let mut library = fresh().await;
    let ids = add_tracks(library.conn(), "doomed", 10).await;

    tracks::remove_many(library.conn(), &[])
        .await
        .expect("an empty removal is a no-op");
    assert_eq!(
        tracks::get_all(library.conn()).await.expect("read").len(),
        10
    );

    tracks::remove_many(library.conn(), &ids)
        .await
        .expect("remove");

    assert!(
        tracks::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

// ── favourites and play counts ────────────────────────────────────────────────

#[tokio::test]
async fn toggle_favorite_flips_the_flag() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/fav.mp3", "Fav").await;

    let on = tracks::toggle_favorite(library.conn(), &id)
        .await
        .expect("toggle")
        .expect("a row");
    assert_eq!(on.is_favorite, Some(true));

    let off = tracks::toggle_favorite(library.conn(), &id)
        .await
        .expect("toggle")
        .expect("a row");
    assert_eq!(off.is_favorite, Some(false));
}

#[tokio::test]
async fn get_favorites_returns_only_favourites_newest_first() {
    let mut library = fresh().await;
    let older = add_track(library.conn(), "/music/a.mp3", "A").await;
    let newer = add_track(library.conn(), "/music/b.mp3", "B").await;
    add_track(library.conn(), "/music/c.mp3", "C").await;

    set_created_at(library.conn(), &older, "2026-01-01 00:00:00").await;
    set_created_at(library.conn(), &newer, "2026-06-01 00:00:00").await;
    tracks::toggle_favorite(library.conn(), &older)
        .await
        .expect("toggle");
    tracks::toggle_favorite(library.conn(), &newer)
        .await
        .expect("toggle");

    let favorites = tracks::get_favorites(library.conn()).await.expect("read");

    assert_eq!(
        favorites.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
        vec![newer.as_str(), older.as_str()]
    );
}

#[tokio::test]
async fn increment_play_count_adds_one() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/played.mp3", "Played").await;

    for expected in 1..=3 {
        let row = tracks::increment_play_count(library.conn(), &id)
            .await
            .expect("increment")
            .expect("a row");
        assert_eq!(row.play_count, Some(expected));
    }
}

// ── lookups ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn exists_answers_for_a_known_and_an_unknown_path() {
    let mut library = fresh().await;
    add_track(library.conn(), "/music/exists.mp3", "Exists").await;

    assert!(
        tracks::exists(library.conn(), "/music/exists.mp3")
            .await
            .expect("look up")
    );
    assert!(
        !tracks::exists(library.conn(), "/music/nope.mp3")
            .await
            .expect("look up")
    );
}

#[tokio::test]
async fn exists_many_returns_the_known_paths_deduplicated() {
    let mut library = fresh().await;
    add_tracks(library.conn(), "known", 3).await;

    assert!(
        tracks::exists_many(library.conn(), &[])
            .await
            .expect("look up")
            .is_empty()
    );

    let asked: Vec<String> = vec![
        "/music/known-0.mp3".to_owned(),
        "/music/known-0.mp3".to_owned(),
        "/music/known-2.mp3".to_owned(),
        "/music/absent.mp3".to_owned(),
    ];
    let mut found = tracks::exists_many(library.conn(), &asked)
        .await
        .expect("look up");
    found.sort();

    assert_eq!(found, vec!["/music/known-0.mp3", "/music/known-2.mp3"]);
}

/// Six hundred paths spans the 500-per-statement chunk boundary.
#[tokio::test]
async fn exists_many_spans_the_chunk_boundary() {
    let mut library = fresh().await;
    add_tracks(library.conn(), "bulk", 600).await;

    let asked: Vec<String> = (0..600).map(|i| format!("/music/bulk-{i}.mp3")).collect();
    let found = tracks::exists_many(library.conn(), &asked)
        .await
        .expect("look up");

    assert_eq!(found.len(), 600);
}

#[tokio::test]
async fn get_id_by_path_finds_the_track_or_nothing() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/findme.mp3", "Find Me").await;

    assert_eq!(
        tracks::get_id_by_path(library.conn(), "/music/findme.mp3")
            .await
            .expect("look up"),
        Some(id)
    );
    assert_eq!(
        tracks::get_id_by_path(library.conn(), "/music/absent.mp3")
            .await
            .expect("look up"),
        None
    );
}
