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
    let mut library = fresh().await;

    let created = playlists::create(
        library.conn(),
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
    let mut library = fresh().await;
    let id = playlist(library.conn(), "Findable").await;

    let found = playlists::get(library.conn(), &id)
        .await
        .expect("read")
        .expect("a row");
    assert_eq!(found.name, "Findable");

    assert!(
        playlists::get(library.conn(), "not-a-playlist")
            .await
            .expect("read")
            .is_none()
    );
}

/// `created_at` alone, with no `rowid` tie-break — playlists are created one
/// user action at a time, so v1 never needed one here.
#[tokio::test]
async fn get_all_returns_the_newest_first() {
    let mut library = fresh().await;
    let older = playlist(library.conn(), "Older").await;
    let newer = playlist(library.conn(), "Newer").await;

    sqlx::query("UPDATE playlists SET created_at = ?1 WHERE id = ?2")
        .bind("2026-01-01 00:00:00")
        .bind(&older)
        .execute(library.conn())
        .await
        .expect("backdate");

    let all = playlists::get_all(library.conn()).await.expect("read");

    assert_eq!(
        all.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        vec![newer.as_str(), older.as_str()]
    );
}

#[tokio::test]
async fn update_patches_named_fields_and_leaves_the_rest() {
    let mut library = fresh().await;
    let id = playlists::create(
        library.conn(),
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
        library.conn(),
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
    let mut library = fresh().await;
    let id = playlist(library.conn(), "Timestamped").await;

    let updated = playlists::update(library.conn(), &id, &PlaylistUpdateInput::default())
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
    let mut library = fresh().await;

    assert!(
        playlists::update(library.conn(), "nope", &PlaylistUpdateInput::default())
            .await
            .expect("update")
            .is_none()
    );
}

#[tokio::test]
async fn delete_removes_the_playlist_and_cascades_its_membership() {
    let mut library = fresh().await;
    let track = add_track(library.conn(), "/music/kept.mp3", "Kept").await;
    let id = playlist(library.conn(), "To Delete").await;
    playlist_tracks::add_track(library.conn(), &id, &track)
        .await
        .expect("add");

    playlists::delete(library.conn(), &id)
        .await
        .expect("delete");

    assert!(
        playlists::get_all(library.conn())
            .await
            .expect("read")
            .is_empty()
    );
    let orphans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM playlist_tracks")
        .fetch_one(library.conn())
        .await
        .expect("count");
    assert_eq!(orphans, 0, "membership cascades");
    assert!(
        shiranami_db::repo::tracks::get_id_by_path(library.conn(), "/music/kept.mp3")
            .await
            .expect("read")
            .is_some(),
        "the track itself survives"
    );
}

#[tokio::test]
async fn create_with_tracks_seeds_membership_in_input_order() {
    let mut library = fresh().await;
    let first = add_track(library.conn(), "/music/a.mp3", "A").await;
    let second = add_track(library.conn(), "/music/b.mp3", "B").await;
    let third = add_track(library.conn(), "/music/c.mp3", "C").await;

    let created = playlists::create_with_tracks(
        library.conn(),
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
    assert_eq!(
        titles(library.conn(), &created.id).await,
        vec!["C", "A", "B"]
    );
}

/// Two hundred and fifty tracks spans three insert chunks, and positions have
/// to keep counting across the boundaries.
#[tokio::test]
async fn create_with_tracks_spans_the_insert_chunk_boundary() {
    let mut library = fresh().await;
    let ids = add_tracks(library.conn(), "seed", 250).await;

    let created = playlists::create_with_tracks(
        library.conn(),
        &PlaylistCreateWithTracksInput {
            name: "Big".to_owned(),
            description: None,
            track_ids: ids.clone(),
        },
    )
    .await
    .expect("create")
    .expect("a row");

    assert_eq!(playlist_track_ids(library.conn(), &created.id).await, ids);
}

/// Unlike `add-tracks`, this channel does not de-duplicate: a repeat violates
/// `UNIQUE(playlist_id, track_id)` and rolls the whole creation back, exactly
/// as v1's transaction did.
#[tokio::test]
async fn create_with_tracks_rolls_back_on_a_duplicate_id() {
    let mut library = fresh().await;
    let track = add_track(library.conn(), "/music/only.mp3", "Only").await;

    let attempt = playlists::create_with_tracks(
        library.conn(),
        &PlaylistCreateWithTracksInput {
            name: "Doomed".to_owned(),
            description: None,
            track_ids: vec![track.clone(), track],
        },
    )
    .await;

    assert!(attempt.is_err(), "the UNIQUE constraint stands");
    assert!(
        playlists::get_all(library.conn())
            .await
            .expect("read")
            .is_empty(),
        "and the playlist row goes with it"
    );
}

// ── the cover-art write guard ─────────────────────────────────────────────────

/// "Use this track's cover" copies a value the renderer was shown, so
/// `cover_art` takes the same guard `tracks.album_art` does — and for the same
/// reason: the art prune counts playlist covers as references, and a loopback
/// URL is not one it can recognise.
#[tokio::test]
async fn a_cover_that_arrives_as_a_loopback_url_is_stored_canonically() {
    let mut library = fresh().await;

    let created = playlists::create(
        library.conn(),
        &PlaylistCreateInput {
            name: "Covered".to_owned(),
            description: None,
            cover_art: Some("http://127.0.0.1:60241/9f8e7d6c/art/abc123.jpg".to_owned()),
        },
    )
    .await
    .expect("create")
    .expect("a row");
    assert_eq!(
        created.cover_art.as_deref(),
        Some("shiranami-art://art/abc123.jpg")
    );

    let updated = playlists::update(
        library.conn(),
        &created.id,
        &PlaylistUpdateInput {
            cover_art: Some("http://localhost:50346/deadbeef/art/other.png".to_owned()),
            ..PlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");
    assert_eq!(
        updated.cover_art.as_deref(),
        Some("shiranami-art://art/other.png")
    );

    let remote = playlists::update(
        library.conn(),
        &created.id,
        &PlaylistUpdateInput {
            cover_art: Some("https://example.com/cover.jpg".to_owned()),
            ..PlaylistUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");
    assert_eq!(
        remote.cover_art.as_deref(),
        Some("https://example.com/cover.jpg"),
        "a remote cover is a legitimate value and stays one"
    );
}
