//! `db:playlists:*` against a real database — both halves of the namespace.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    PlaylistCreateInput, PlaylistCreateWithTracksInput, PlaylistUpdateInput,
};
use shiranami_db::repo::{playlist_tracks, playlists};

use library::{Library, add_track, add_tracks, fresh};

/// Create a playlist and return its id.
async fn playlist(library: &Library, name: &str) -> String {
    playlists::create(
        &library.pool,
        &PlaylistCreateInput {
            name: name.to_owned(),
            ..PlaylistCreateInput::default()
        },
    )
    .await
    .expect("create")
    .expect("a row")
    .id
}

/// The titles currently in a playlist, in playlist order.
async fn titles(library: &Library, playlist_id: &str) -> Vec<String> {
    playlist_tracks::get_tracks(&library.pool, playlist_id)
        .await
        .expect("read")
        .into_iter()
        .map(|track| track.title)
        .collect()
}

// ── the playlist rows ─────────────────────────────────────────────────────────

#[tokio::test]
async fn create_inserts_a_playlist_and_returns_it() {
    let library = fresh().await;

    let created = playlists::create(
        &library.pool,
        &PlaylistCreateInput {
            name: "My Playlist".to_owned(),
            description: Some("A test playlist".to_owned()),
            cover_art: None,
        },
    )
    .await
    .expect("create")
    .expect("a row");

    assert!(!created.id.is_empty());
    assert_eq!(created.name, "My Playlist");
    assert_eq!(created.description.as_deref(), Some("A test playlist"));
    assert_eq!(created.cover_art, None);
}

#[tokio::test]
async fn get_returns_one_playlist_or_nothing() {
    let library = fresh().await;
    let id = playlist(&library, "Findable").await;

    let found = playlists::get(&library.pool, &id)
        .await
        .expect("read")
        .expect("a row");
    assert_eq!(found.name, "Findable");

    assert!(
        playlists::get(&library.pool, "not-a-playlist")
            .await
            .expect("read")
            .is_none()
    );
}

/// `created_at` alone, with no `rowid` tie-break — playlists are created one
/// user action at a time, so v1 never needed one here.
#[tokio::test]
async fn get_all_returns_the_newest_first() {
    let library = fresh().await;
    let older = playlist(&library, "Older").await;
    let newer = playlist(&library, "Newer").await;

    sqlx::query("UPDATE playlists SET created_at = ?1 WHERE id = ?2")
        .bind("2026-01-01 00:00:00")
        .bind(&older)
        .execute(&library.pool)
        .await
        .expect("backdate");

    let all = playlists::get_all(&library.pool).await.expect("read");

    assert_eq!(
        all.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        vec![newer.as_str(), older.as_str()]
    );
}

#[tokio::test]
async fn update_patches_named_fields_and_leaves_the_rest() {
    let library = fresh().await;
    let id = playlists::create(
        &library.pool,
        &PlaylistCreateInput {
            name: "Before".to_owned(),
            description: Some("Kept".to_owned()),
            cover_art: None,
        },
    )
    .await
    .expect("create")
    .expect("a row")
    .id;

    let updated = playlists::update(
        &library.pool,
        &id,
        &PlaylistUpdateInput {
            name: Some("After".to_owned()),
            ..PlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");

    assert_eq!(updated.name, "After");
    assert_eq!(updated.description.as_deref(), Some("Kept"));
}

/// v1 spread the patch over an always-present `updatedAt`, so even a patch that
/// names nothing is a real statement — and the timestamp it writes is the
/// JavaScript spelling, not the column default's.
#[tokio::test]
async fn update_always_bumps_updated_at_in_the_javascript_format() {
    let library = fresh().await;
    let id = playlist(&library, "Timestamped").await;

    let updated = playlists::update(&library.pool, &id, &PlaylistUpdateInput::default())
        .await
        .expect("an empty patch still stamps")
        .expect("a row");

    assert_eq!(updated.name, "Timestamped");
    assert_eq!(updated.updated_at.len(), 24);
    assert!(updated.updated_at.ends_with('Z'));
    assert_eq!(updated.created_at.len(), 19, "the default's spelling");
}

#[tokio::test]
async fn update_of_an_unknown_id_returns_nothing() {
    let library = fresh().await;

    assert!(
        playlists::update(&library.pool, "nope", &PlaylistUpdateInput::default())
            .await
            .expect("update")
            .is_none()
    );
}

#[tokio::test]
async fn delete_removes_the_playlist_and_cascades_its_membership() {
    let library = fresh().await;
    let track = add_track(&library, "/music/kept.mp3", "Kept").await;
    let id = playlist(&library, "To Delete").await;
    playlist_tracks::add_track(&library.pool, &id, &track)
        .await
        .expect("add");

    playlists::delete(&library.pool, &id).await.expect("delete");

    assert!(
        playlists::get_all(&library.pool)
            .await
            .expect("read")
            .is_empty()
    );
    let orphans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM playlist_tracks")
        .fetch_one(&library.pool)
        .await
        .expect("count");
    assert_eq!(orphans, 0, "membership cascades");
    assert!(
        shiranami_db::repo::tracks::get_id_by_path(&library.pool, "/music/kept.mp3")
            .await
            .expect("read")
            .is_some(),
        "the track itself survives"
    );
}

#[tokio::test]
async fn create_with_tracks_seeds_membership_in_input_order() {
    let library = fresh().await;
    let first = add_track(&library, "/music/a.mp3", "A").await;
    let second = add_track(&library, "/music/b.mp3", "B").await;
    let third = add_track(&library, "/music/c.mp3", "C").await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Seeded".to_owned(),
            description: None,
            track_ids: vec![third.clone(), first.clone(), second.clone()],
        },
    )
    .await
    .expect("create")
    .expect("a row");

    assert_eq!(created.name, "Seeded");
    assert_eq!(titles(&library, &created.id).await, vec!["C", "A", "B"]);
}

/// Two hundred and fifty tracks spans three insert chunks, and positions have
/// to keep counting across the boundaries.
#[tokio::test]
async fn create_with_tracks_spans_the_insert_chunk_boundary() {
    let library = fresh().await;
    let ids = add_tracks(&library, "seed", 250).await;

    let created = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Big".to_owned(),
            description: None,
            track_ids: ids.clone(),
        },
    )
    .await
    .expect("create")
    .expect("a row");

    let stored: Vec<String> = playlist_tracks::get_tracks(&library.pool, &created.id)
        .await
        .expect("read")
        .into_iter()
        .map(|track| track.id)
        .collect();

    assert_eq!(stored, ids);
}

/// Unlike `add-tracks`, this channel does not de-duplicate: a repeat violates
/// `UNIQUE(playlist_id, track_id)` and rolls the whole creation back, exactly
/// as v1's transaction did.
#[tokio::test]
async fn create_with_tracks_rolls_back_on_a_duplicate_id() {
    let library = fresh().await;
    let track = add_track(&library, "/music/only.mp3", "Only").await;

    let attempt = playlists::create_with_tracks(
        &library.pool,
        &PlaylistCreateWithTracksInput {
            name: "Doomed".to_owned(),
            description: None,
            track_ids: vec![track.clone(), track],
        },
    )
    .await;

    assert!(attempt.is_err(), "the UNIQUE constraint stands");
    assert!(
        playlists::get_all(&library.pool)
            .await
            .expect("read")
            .is_empty(),
        "and the playlist row goes with it"
    );
}

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

    let stored: Vec<String> = playlist_tracks::get_tracks(&library.pool, &created.id)
        .await
        .expect("read")
        .into_iter()
        .map(|track| track.id)
        .collect();

    assert_eq!(stored, reversed);
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
