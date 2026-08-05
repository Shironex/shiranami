//! `db:tracks:update` and `db:tracks:update-many` against a real database.
//!
//! Their own suite because the patch semantics are the part of the tracks
//! namespace with the sharpest failure mode: collapsing "leave this column
//! alone" into "clear this column" would wipe metadata across a library the
//! user cannot undo, and it would do it on the *quiet* path — a partial patch
//! from a rename dialog, not a bulk operation anyone is watching.

#[path = "support/library.rs"]
mod library;

use shiranami_core::models::TrackUpdateInput;
use shiranami_db::repo::tracks;

use library::{add_track, fresh, retitle};

// ── update ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn update_changes_fields_and_returns_the_row() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/old.mp3", "Old Title").await;

    let updated = tracks::update(library.conn(), &id, &retitle("New Title"))
        .await
        .expect("update")
        .expect("a row");

    assert_eq!(updated.title, "New Title");
    assert_eq!(updated.album.as_deref(), Some("Test Album"), "untouched");
}

/// The distinction the whole [`shiranami_core::models::Patch`] type exists for.
#[tokio::test]
async fn update_leaves_an_absent_field_alone_and_clears_an_explicit_null() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/patch.mp3", "Patch Me").await;

    let after_absent = tracks::update(library.conn(), &id, &retitle("Renamed"))
        .await
        .expect("update")
        .expect("a row");
    assert_eq!(
        after_absent.artist.as_deref(),
        Some("Test Artist"),
        "an absent key must not clear the column"
    );

    let after_null = tracks::update(
        library.conn(),
        &id,
        &TrackUpdateInput {
            artist: Some(None),
            ..TrackUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");
    assert_eq!(after_null.artist, None, "an explicit null clears it");
    assert_eq!(after_null.title, "Renamed", "and touches nothing else");
}

#[tokio::test]
async fn update_with_a_patch_that_says_nothing_returns_the_unchanged_row() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/quiet.mp3", "Quiet").await;

    let unchanged = tracks::update(library.conn(), &id, &TrackUpdateInput::default())
        .await
        .expect("an empty patch is a no-op, not an error")
        .expect("a row");

    assert_eq!(unchanged.title, "Quiet");
}

#[tokio::test]
async fn update_of_an_unknown_id_returns_nothing() {
    let mut library = fresh().await;

    assert!(
        tracks::update(library.conn(), "not-a-track", &retitle("Nope"))
            .await
            .expect("update")
            .is_none()
    );
}

// ── update_many ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn update_many_applies_distinct_patches_and_groups_identical_ones() {
    let mut library = fresh().await;
    let first = add_track(library.conn(), "/music/one.mp3", "One").await;
    let second = add_track(library.conn(), "/music/two.mp3", "Two").await;
    let third = add_track(library.conn(), "/music/three.mp3", "Three").await;

    let shared = TrackUpdateInput {
        album: Some(Some("New Album".to_owned())),
        year: Some(Some(2020)),
        ..TrackUpdateInput::default()
    };
    let solo = TrackUpdateInput {
        artist: Some(Some("Real Artist".to_owned())),
        ..TrackUpdateInput::default()
    };

    tracks::update_many(
        library.conn(),
        &[
            (first.clone(), shared.clone()),
            (second.clone(), shared),
            (third.clone(), solo),
        ],
    )
    .await
    .expect("update");

    let all = tracks::get_all(library.conn()).await.expect("read");
    let find = |id: &str| all.iter().find(|t| t.id == id).expect("the track").clone();

    assert_eq!(find(&first).album.as_deref(), Some("New Album"));
    assert_eq!(find(&first).year, Some(2020));
    assert_eq!(find(&second).album.as_deref(), Some("New Album"));
    assert_eq!(find(&second).year, Some(2020));
    assert_eq!(find(&third).artist.as_deref(), Some("Real Artist"));
    assert_eq!(
        find(&third).album.as_deref(),
        Some("Test Album"),
        "untouched fields stay put"
    );
}

#[tokio::test]
async fn update_many_skips_patches_that_say_nothing() {
    let mut library = fresh().await;
    let keep = add_track(library.conn(), "/music/keep.mp3", "Keep Me").await;
    let change = add_track(library.conn(), "/music/change.mp3", "Change Me").await;

    tracks::update_many(library.conn(), &[])
        .await
        .expect("an empty list is a no-op");

    tracks::update_many(
        library.conn(),
        &[
            (keep.clone(), TrackUpdateInput::default()),
            (
                change.clone(),
                TrackUpdateInput {
                    album: Some(Some("New".to_owned())),
                    ..TrackUpdateInput::default()
                },
            ),
        ],
    )
    .await
    .expect("an empty patch must not abort the transaction");

    let all = tracks::get_all(library.conn()).await.expect("read");
    let find = |id: &str| all.iter().find(|t| t.id == id).expect("the track").clone();

    assert_eq!(find(&keep).title, "Keep Me");
    assert_eq!(find(&change).album.as_deref(), Some("New"));
}

/// Grouping is keyed on the patch, so "clear the artist" must not merge with
/// "leave the artist alone" and clear both.
#[tokio::test]
async fn update_many_does_not_merge_a_cleared_field_with_an_absent_one() {
    let mut library = fresh().await;
    let cleared = add_track(library.conn(), "/music/cleared.mp3", "Cleared").await;
    let kept = add_track(library.conn(), "/music/kept.mp3", "Kept").await;

    tracks::update_many(
        library.conn(),
        &[
            (
                cleared.clone(),
                TrackUpdateInput {
                    artist: Some(None),
                    ..TrackUpdateInput::default()
                },
            ),
            (
                kept.clone(),
                TrackUpdateInput {
                    title: Some("Kept".to_owned()),
                    ..TrackUpdateInput::default()
                },
            ),
        ],
    )
    .await
    .expect("update");

    let all = tracks::get_all(library.conn()).await.expect("read");
    let find = |id: &str| all.iter().find(|t| t.id == id).expect("the track").clone();

    assert_eq!(find(&cleared).artist, None);
    assert_eq!(find(&kept).artist.as_deref(), Some("Test Artist"));
}

// ── the album-art write guard ─────────────────────────────────────────────────

/// The bug this guard exists for: the renderer is *shown* a loopback URL and
/// posts it back through the enrich apply path, which made a port and a session
/// token durable — and, because the art prune recognises only the
/// `shiranami-art://` form, made a full cover cache look unreferenced.
#[tokio::test]
async fn update_normalises_a_loopback_art_url_into_the_canonical_form() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/art.mp3", "Art").await;

    let updated = tracks::update(
        library.conn(),
        &id,
        &TrackUpdateInput {
            album_art: Some(Some(
                "http://127.0.0.1:60241/9f8e7d6c/art/abc123.jpg".to_owned(),
            )),
            ..TrackUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");

    assert_eq!(
        updated.album_art.as_deref(),
        Some("shiranami-art://art/abc123.jpg"),
        "a session-scoped address must never become durable"
    );
}

/// The guard normalises; it does not filter. A remote cover is a legitimate
/// value of the column and has to survive the write untouched, and the three
/// patch states have to keep meaning what they meant.
#[tokio::test]
async fn update_leaves_a_remote_cover_and_the_patch_states_alone() {
    let mut library = fresh().await;
    let id = add_track(library.conn(), "/music/remote.mp3", "Remote").await;

    let remote = tracks::update(
        library.conn(),
        &id,
        &TrackUpdateInput {
            album_art: Some(Some("https://example.com/cover.jpg".to_owned())),
            ..TrackUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");
    assert_eq!(
        remote.album_art.as_deref(),
        Some("https://example.com/cover.jpg")
    );

    let renamed = tracks::update(
        library.conn(),
        &id,
        &TrackUpdateInput {
            title: Some("Renamed".to_owned()),
            ..TrackUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");
    assert_eq!(
        renamed.album_art.as_deref(),
        Some("https://example.com/cover.jpg"),
        "an absent field still says nothing"
    );

    let cleared = tracks::update(
        library.conn(),
        &id,
        &TrackUpdateInput {
            album_art: Some(None),
            ..TrackUpdateInput::default()
        },
    )
    .await
    .expect("update")
    .expect("a row");
    assert_eq!(cleared.album_art, None, "an explicit clear still clears");
}

/// `db:tracks:update-many` is the channel the enrich apply path actually used,
/// and it groups by patch — so the guard has to run before the grouping rather
/// than after it.
#[tokio::test]
async fn update_many_normalises_every_grouped_art_value() {
    let mut library = fresh().await;
    let first = add_track(library.conn(), "/music/a.mp3", "A").await;
    let second = add_track(library.conn(), "/music/b.mp3", "B").await;

    let loopback = "http://127.0.0.1:50346/deadbeef/art/shared.jpg".to_owned();
    tracks::update_many(
        library.conn(),
        &[
            (
                first.clone(),
                TrackUpdateInput {
                    album_art: Some(Some(loopback.clone())),
                    ..TrackUpdateInput::default()
                },
            ),
            (
                second.clone(),
                TrackUpdateInput {
                    album_art: Some(Some(loopback)),
                    ..TrackUpdateInput::default()
                },
            ),
        ],
    )
    .await
    .expect("update");

    let all = tracks::get_all(library.conn()).await.expect("read");
    for id in [&first, &second] {
        let track = all.iter().find(|t| &t.id == id).expect("the track");
        assert_eq!(
            track.album_art.as_deref(),
            Some("shiranami-art://art/shared.jpg")
        );
    }
}
