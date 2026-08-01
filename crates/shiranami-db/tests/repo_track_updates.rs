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
    let library = fresh().await;
    let id = add_track(&library, "/music/old.mp3", "Old Title").await;

    let updated = tracks::update(&library.pool, &id, &retitle("New Title"))
        .await
        .expect("update")
        .expect("a row");

    assert_eq!(updated.title, "New Title");
    assert_eq!(updated.album.as_deref(), Some("Test Album"), "untouched");
}

/// The distinction the whole [`shiranami_core::models::Patch`] type exists for.
#[tokio::test]
async fn update_leaves_an_absent_field_alone_and_clears_an_explicit_null() {
    let library = fresh().await;
    let id = add_track(&library, "/music/patch.mp3", "Patch Me").await;

    let after_absent = tracks::update(&library.pool, &id, &retitle("Renamed"))
        .await
        .expect("update")
        .expect("a row");
    assert_eq!(
        after_absent.artist.as_deref(),
        Some("Test Artist"),
        "an absent key must not clear the column"
    );

    let after_null = tracks::update(
        &library.pool,
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
    let library = fresh().await;
    let id = add_track(&library, "/music/quiet.mp3", "Quiet").await;

    let unchanged = tracks::update(&library.pool, &id, &TrackUpdateInput::default())
        .await
        .expect("an empty patch is a no-op, not an error")
        .expect("a row");

    assert_eq!(unchanged.title, "Quiet");
}

#[tokio::test]
async fn update_of_an_unknown_id_returns_nothing() {
    let library = fresh().await;

    assert!(
        tracks::update(&library.pool, "not-a-track", &retitle("Nope"))
            .await
            .expect("update")
            .is_none()
    );
}

// ── update_many ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn update_many_applies_distinct_patches_and_groups_identical_ones() {
    let library = fresh().await;
    let first = add_track(&library, "/music/one.mp3", "One").await;
    let second = add_track(&library, "/music/two.mp3", "Two").await;
    let third = add_track(&library, "/music/three.mp3", "Three").await;

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
        &library.pool,
        &[
            (first.clone(), shared.clone()),
            (second.clone(), shared),
            (third.clone(), solo),
        ],
    )
    .await
    .expect("update");

    let all = tracks::get_all(&library.pool).await.expect("read");
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
    let library = fresh().await;
    let keep = add_track(&library, "/music/keep.mp3", "Keep Me").await;
    let change = add_track(&library, "/music/change.mp3", "Change Me").await;

    tracks::update_many(&library.pool, &[])
        .await
        .expect("an empty list is a no-op");

    tracks::update_many(
        &library.pool,
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

    let all = tracks::get_all(&library.pool).await.expect("read");
    let find = |id: &str| all.iter().find(|t| t.id == id).expect("the track").clone();

    assert_eq!(find(&keep).title, "Keep Me");
    assert_eq!(find(&change).album.as_deref(), Some("New"));
}

/// Grouping is keyed on the patch, so "clear the artist" must not merge with
/// "leave the artist alone" and clear both.
#[tokio::test]
async fn update_many_does_not_merge_a_cleared_field_with_an_absent_one() {
    let library = fresh().await;
    let cleared = add_track(&library, "/music/cleared.mp3", "Cleared").await;
    let kept = add_track(&library, "/music/kept.mp3", "Kept").await;

    tracks::update_many(
        &library.pool,
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

    let all = tracks::get_all(&library.pool).await.expect("read");
    let find = |id: &str| all.iter().find(|t| t.id == id).expect("the track").clone();

    assert_eq!(find(&cleared).artist, None);
    assert_eq!(find(&kept).artist.as_deref(), Some("Test Artist"));
}
