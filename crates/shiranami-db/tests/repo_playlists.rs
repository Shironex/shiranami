//! `db:playlists:*` — the playlist rows, against a real database.
//!
//! The six channels that read and write the `playlists` table. The seven that
//! operate on membership are in `repo_playlist_tracks.rs`.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::{
    PlaylistCreateInput, PlaylistCreateWithTracksInput, PlaylistUpdateInput,
};
use shiranami_db::repo::{playlist_tracks, playlists};

use library::{
    add_track, add_tracks, fresh, playlist, playlist_titles as titles, playlist_track_ids,
};

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

    assert_eq!(playlist_track_ids(&library, &created.id).await, ids);
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
