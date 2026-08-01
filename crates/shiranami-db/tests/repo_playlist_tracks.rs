//! `db:playlists:*` — the membership half, against a real database.
//!
//! The seven channels that operate on `playlist_tracks`: ordering, idempotent
//! membership, and the set-based reorder. The playlist rows themselves are in
//! `repo_playlists.rs`.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::PlaylistCreateWithTracksInput;
use shiranami_db::repo::{playlist_tracks, playlists};

use library::{
    add_track, add_tracks, fresh, playlist, playlist_titles as titles, playlist_track_ids,
};

// ── membership ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn get_tracks_returns_the_playlist_in_position_order() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "Track A").await;
    let second = add_track(&library, "/music/b.mp3", "Track B").await;
    let id = playlist(&library, "Ordered").await;

    playlist_tracks::add_track(&library.pool, &id, &first)
        .await
        .expect("add");
    playlist_tracks::add_track(&library.pool, &id, &second)
        .await
        .expect("add");

    assert_eq!(titles(&library, &id).await, vec!["Track A", "Track B"]);
}

#[tokio::test]
async fn get_tracks_on_an_empty_or_unknown_playlist_is_empty() {
    let library = fresh().await;
    let id = playlist(&library, "Empty").await;

    assert!(titles(&library, &id).await.is_empty());
    assert!(titles(&library, "not-a-playlist").await.is_empty());
}

/// Idempotent per `UNIQUE(playlist_id, track_id)`: the second add returns the
/// id of the row that is already there and writes nothing.
#[tokio::test]
async fn add_track_is_idempotent_and_returns_the_membership_id() {
    let library = fresh().await;
    let track = add_track(&library, "/music/one.mp3", "One").await;
    let id = playlist(&library, "Dedupe").await;

    let first = playlist_tracks::add_track(&library.pool, &id, &track)
        .await
        .expect("add");
    let second = playlist_tracks::add_track(&library.pool, &id, &track)
        .await
        .expect("the repeat must not error");

    assert_eq!(second, first, "the same membership row");
    assert_eq!(titles(&library, &id).await.len(), 1);
}

#[tokio::test]
async fn add_tracks_appends_in_input_order_and_is_idempotent() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "A").await;
    let second = add_track(&library, "/music/b.mp3", "B").await;
    let third = add_track(&library, "/music/c.mp3", "C").await;
    let id = playlist(&library, "Batch Add").await;

    playlist_tracks::add_tracks(&library.pool, &id, &[first, second.clone()])
        .await
        .expect("add");
    assert_eq!(titles(&library, &id).await, vec!["A", "B"]);

    // Re-adding B and adding C appends only C, after the existing tail.
    playlist_tracks::add_tracks(&library.pool, &id, &[second, third])
        .await
        .expect("add");
    assert_eq!(titles(&library, &id).await, vec!["A", "B", "C"]);
}

#[tokio::test]
async fn add_tracks_de_dups_repeats_within_one_call() {
    let library = fresh().await;
    let track = add_track(&library, "/music/a.mp3", "A").await;
    let id = playlist(&library, "Dedup Batch").await;

    playlist_tracks::add_tracks(&library.pool, &id, &[track.clone(), track.clone(), track])
        .await
        .expect("add");

    assert_eq!(titles(&library, &id).await.len(), 1);
}

#[tokio::test]
async fn add_tracks_tolerates_an_empty_list() {
    let library = fresh().await;
    let id = playlist(&library, "Nothing").await;

    playlist_tracks::add_tracks(&library.pool, &id, &[])
        .await
        .expect("a no-op");

    assert!(titles(&library, &id).await.is_empty());
}

#[tokio::test]
async fn remove_track_takes_one_track_out() {
    let library = fresh().await;
    let track = add_track(&library, "/music/a.mp3", "A").await;
    let id = playlist(&library, "Remove").await;
    playlist_tracks::add_track(&library.pool, &id, &track)
        .await
        .expect("add");

    playlist_tracks::remove_track(&library.pool, &id, &track)
        .await
        .expect("remove");

    assert!(titles(&library, &id).await.is_empty());
}

#[tokio::test]
async fn remove_tracks_takes_the_supplied_ids_and_leaves_the_rest() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "A").await;
    let second = add_track(&library, "/music/b.mp3", "B").await;
    let third = add_track(&library, "/music/c.mp3", "C").await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Batch Remove".to_owned(),
            description: None,
            track_ids: vec![first.clone(), second, third.clone()],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    playlist_tracks::remove_tracks(&library.pool, &created.id, &[])
        .await
        .expect("a no-op");
    assert_eq!(titles(&library, &created.id).await.len(), 3);

    playlist_tracks::remove_tracks(&library.pool, &created.id, &[first, third])
        .await
        .expect("remove");

    assert_eq!(titles(&library, &created.id).await, vec!["B"]);
}

/// Removal is scoped to the playlist: the same track in another playlist stays.
#[tokio::test]
async fn remove_tracks_does_not_reach_into_other_playlists() {
    let library = fresh().await;
    let track = add_track(&library, "/music/shared.mp3", "Shared").await;
    let mine = playlist(&library, "Mine").await;
    let theirs = playlist(&library, "Theirs").await;

    for id in [&mine, &theirs] {
        playlist_tracks::add_track(&library.pool, id, &track)
            .await
            .expect("add");
    }

    playlist_tracks::remove_tracks(&library.pool, &mine, &[track])
        .await
        .expect("remove");

    assert!(titles(&library, &mine).await.is_empty());
    assert_eq!(titles(&library, &theirs).await, vec!["Shared"]);
}

// ── reorder ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn reorder_rewrites_positions_to_match_the_supplied_order() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "A").await;
    let second = add_track(&library, "/music/b.mp3", "B").await;
    let third = add_track(&library, "/music/c.mp3", "C").await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Reorder".to_owned(),
            description: None,
            track_ids: vec![first.clone(), second.clone(), third.clone()],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    playlist_tracks::reorder(&library.pool, &created.id, &[third, first, second])
        .await
        .expect("reorder");

    assert_eq!(titles(&library, &created.id).await, vec!["C", "A", "B"]);
}

/// Two hundred and fifty tracks spans three reorder chunks (100/100/50), and a
/// full reversal only round-trips if positions are written correctly across the
/// boundaries.
#[tokio::test]
async fn reorder_reverses_a_playlist_larger_than_the_chunk_size() {
    let library = fresh().await;
    let ids = add_tracks(&library, "reorder", 250).await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Big Reorder".to_owned(),
            description: None,
            track_ids: ids.clone(),
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let reversed: Vec<String> = ids.into_iter().rev().collect();
    playlist_tracks::reorder(&library.pool, &created.id, &reversed)
        .await
        .expect("reorder");

    assert_eq!(playlist_track_ids(&library, &created.id).await, reversed);
}

#[tokio::test]
async fn reorder_preserves_membership_row_ids() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "A").await;
    let second = add_track(&library, "/music/b.mp3", "B").await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Stable".to_owned(),
            description: None,
            track_ids: vec![first.clone(), second.clone()],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let before: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY track_id",
    )
    .bind(&created.id)
    .fetch_all(&library.pool)
    .await
    .expect("read");

    playlist_tracks::reorder(&library.pool, &created.id, &[second, first])
        .await
        .expect("reorder");

    let after: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY track_id",
    )
    .bind(&created.id)
    .fetch_all(&library.pool)
    .await
    .expect("read");

    assert_eq!(before, after, "only position changes");
}

#[tokio::test]
async fn reorder_tolerates_an_empty_list() {
    let library = fresh().await;
    let id = playlist(&library, "Nothing").await;

    playlist_tracks::reorder(&library.pool, &id, &[])
        .await
        .expect("a no-op");
}

// ── get_playlists_for_tracks ──────────────────────────────────────────────────

/// The `HAVING` is an all-of, not an any-of: a playlist holding two of three
/// asked-for tracks does not qualify.
#[tokio::test]
async fn get_playlists_for_tracks_returns_only_playlists_holding_every_track() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "A").await;
    let second = add_track(&library, "/music/b.mp3", "B").await;

    let both = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Both".to_owned(),
            description: None,
            track_ids: vec![first.clone(), second.clone()],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Only one".to_owned(),
            description: None,
            track_ids: vec![first.clone()],
        },
    )
    .await
    .expect("create");

    let holding =
        playlist_tracks::get_playlists_for_tracks(&library.pool, &[first.clone(), second.clone()])
            .await
            .expect("read");

    assert_eq!(holding, vec![both.id.clone()]);

    // Asked for one track, both playlists qualify.
    let mut holding_one = playlist_tracks::get_playlists_for_tracks(&library.pool, &[first])
        .await
        .expect("read");
    holding_one.sort();
    assert_eq!(holding_one.len(), 2);
}

/// Duplicates in the request must not inflate the `HAVING` count and rule the
/// playlist out.
#[tokio::test]
async fn get_playlists_for_tracks_de_dups_the_request() {
    let library = fresh().await;
    let track = add_track(&library, "/music/a.mp3", "A").await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "One".to_owned(),
            description: None,
            track_ids: vec![track.clone()],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let holding = playlist_tracks::get_playlists_for_tracks(&library.pool, &[track.clone(), track])
        .await
        .expect("read");

    assert_eq!(holding, vec![created.id]);
}

#[tokio::test]
async fn get_playlists_for_tracks_with_no_ids_is_empty() {
    let library = fresh().await;

    assert!(
        playlist_tracks::get_playlists_for_tracks(&library.pool, &[])
            .await
            .expect("read")
            .is_empty()
    );
}
