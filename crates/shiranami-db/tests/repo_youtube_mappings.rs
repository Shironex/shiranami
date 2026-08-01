//! The YouTube-id cache against a real database.
//!
//! This table backs no IPC channel, so there is no handler to compare against —
//! the reference is v1's four inline query sites in `ipc/share.ts` and
//! `services/recommendation-service.ts`. What those sites make observable, and
//! what is therefore asserted here: a miss is an absent map entry rather than an
//! error, a re-resolution updates in place rather than duplicating, the row's
//! primary key survives that update, and `searched_at` keeps the two formats v1
//! left on disk.

#[path = "support/library.rs"]
mod library;

use shiranami_db::repo::youtube_mappings;
use sqlx::{Row, SqliteConnection};

use library::{add_track, fresh};

/// The `searched_at` string a row currently holds.
async fn searched_at(conn: &mut SqliteConnection, track_id: &str) -> String {
    sqlx::query("SELECT searched_at FROM youtube_mappings WHERE track_id = ?1")
        .bind(track_id)
        .fetch_one(conn)
        .await
        .expect("the mapping row exists")
        .get("searched_at")
}

/// The mapping row's primary key, which no caller reads but which must not move.
async fn row_id(conn: &mut SqliteConnection, track_id: &str) -> String {
    sqlx::query("SELECT id FROM youtube_mappings WHERE track_id = ?1")
        .bind(track_id)
        .fetch_one(conn)
        .await
        .expect("the mapping row exists")
        .get("id")
}

#[tokio::test]
async fn a_track_with_no_mapping_reads_as_absent() {
    let mut lib = fresh().await;
    let track = add_track(lib.conn(), "/music/a.mp3", "A").await;

    let found = youtube_mappings::get_for_track(lib.conn(), &track)
        .await
        .expect("read");

    assert_eq!(found, None, "a miss is not an error — the caller searches");
}

#[tokio::test]
async fn upsert_then_read_returns_the_cached_id() {
    let mut lib = fresh().await;
    let track = add_track(lib.conn(), "/music/a.mp3", "A").await;

    youtube_mappings::upsert(lib.conn(), &track, "dQw4w9WgXcQ")
        .await
        .expect("cache the id");

    assert_eq!(
        youtube_mappings::get_for_track(lib.conn(), &track)
            .await
            .expect("read"),
        Some("dQw4w9WgXcQ".to_owned())
    );
}

/// v1's conflict target is `track_id`, the `UNIQUE` column, not the primary key.
/// A second resolution therefore replaces the video on the row that already
/// exists rather than inserting a second one — the `UNIQUE` constraint would
/// have refused that anyway, so the difference is between an update and an
/// error.
#[tokio::test]
async fn a_second_resolution_replaces_the_id_in_place() {
    let mut lib = fresh().await;
    let track = add_track(lib.conn(), "/music/a.mp3", "A").await;

    youtube_mappings::upsert(lib.conn(), &track, "first")
        .await
        .expect("first cache");
    let original_row_id = row_id(lib.conn(), &track).await;

    youtube_mappings::upsert(lib.conn(), &track, "second")
        .await
        .expect("second cache");

    assert_eq!(
        youtube_mappings::get_for_track(lib.conn(), &track)
            .await
            .expect("read"),
        Some("second".to_owned())
    );
    assert_eq!(
        row_id(lib.conn(), &track).await,
        original_row_id,
        "the conflict target is track_id, so the row keeps its own id"
    );

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM youtube_mappings")
        .fetch_one(lib.conn())
        .await
        .expect("count");
    assert_eq!(count, 1, "track_id is UNIQUE — there is only ever one row");
}

/// Both spellings are already in shipped libraries and a v1 build can still be
/// reinstalled over this file during the handover window, so the split between
/// the column default and the handler-written timestamp is reproduced rather
/// than tidied. See `repo::clock`.
#[tokio::test]
async fn an_insert_and_an_update_write_the_two_v1_timestamp_formats() {
    let mut lib = fresh().await;
    let track = add_track(lib.conn(), "/music/a.mp3", "A").await;

    youtube_mappings::upsert(lib.conn(), &track, "first")
        .await
        .expect("first cache");
    let inserted = searched_at(lib.conn(), &track).await;

    assert_eq!(
        inserted.len(),
        19,
        "an insert takes the column's DEFAULT (datetime('now')): {inserted}"
    );
    assert!(inserted.contains(' ') && !inserted.contains('T') && !inserted.ends_with('Z'));

    youtube_mappings::upsert(lib.conn(), &track, "second")
        .await
        .expect("second cache");
    let updated = searched_at(lib.conn(), &track).await;

    assert_eq!(
        updated.len(),
        24,
        "an update reproduces new Date().toISOString(): {updated}"
    );
    assert!(updated.contains('T') && updated.ends_with('Z') && !updated.contains(' '));
}

#[tokio::test]
async fn get_many_keys_by_track_and_omits_the_misses() {
    let mut lib = fresh().await;
    let mapped = add_track(lib.conn(), "/music/a.mp3", "A").await;
    let unmapped = add_track(lib.conn(), "/music/b.mp3", "B").await;

    youtube_mappings::upsert(lib.conn(), &mapped, "video-a")
        .await
        .expect("cache");

    let cached = youtube_mappings::get_many(lib.conn(), &[mapped.clone(), unmapped.clone()])
        .await
        .expect("bulk read");

    assert_eq!(cached.get(&mapped), Some(&"video-a".to_owned()));
    assert_eq!(
        cached.get(&unmapped),
        None,
        "a track with no mapping is absent, so the caller can branch on the miss"
    );
    assert_eq!(cached.len(), 1);
}

#[tokio::test]
async fn get_many_short_circuits_on_an_empty_list() {
    let mut lib = fresh().await;

    let cached = youtube_mappings::get_many(lib.conn(), &[])
        .await
        .expect("bulk read");

    assert!(cached.is_empty());
}

/// v1 chunked the share path at 500 and left the seed path unchunked; both
/// chunk here. The property that matters is that chunking is invisible in the
/// result, so a list spanning several chunks answers exactly as one that does
/// not.
#[tokio::test]
async fn a_list_spanning_several_chunks_answers_completely() {
    let mut lib = fresh().await;

    let mut ids = Vec::new();
    for index in 0..1_200 {
        let track = add_track(lib.conn(), &format!("/music/{index}.mp3"), "T").await;
        youtube_mappings::upsert(lib.conn(), &track, &format!("video-{index}"))
            .await
            .expect("cache");
        ids.push(track);
    }

    let cached = youtube_mappings::get_many(lib.conn(), &ids)
        .await
        .expect("bulk read");

    assert_eq!(cached.len(), 1_200);
    assert_eq!(cached.get(&ids[0]), Some(&"video-0".to_owned()));
    assert_eq!(cached.get(&ids[1_199]), Some(&"video-1199".to_owned()));
}

/// A track repeated across chunk boundaries must not confuse the map, and the
/// caller is allowed to pass one — v1's share path built its id list straight
/// from the playlist's rows.
#[tokio::test]
async fn a_repeated_track_id_answers_once() {
    let mut lib = fresh().await;
    let track = add_track(lib.conn(), "/music/a.mp3", "A").await;
    youtube_mappings::upsert(lib.conn(), &track, "video-a")
        .await
        .expect("cache");

    let cached = youtube_mappings::get_many(lib.conn(), &[track.clone(), track.clone()])
        .await
        .expect("bulk read");

    assert_eq!(cached.len(), 1);
    assert_eq!(cached.get(&track), Some(&"video-a".to_owned()));
}

/// `youtube_id` carries no `UNIQUE` constraint, so two library tracks can
/// legitimately resolve to the same video — a single upload the user owns twice.
/// Discovery subtracts this set from an RD mix, and a duplicate in it would
/// subtract the same video twice for no benefit, which is why v1 used a `Set`.
#[tokio::test]
async fn all_youtube_ids_collapses_two_tracks_sharing_one_video() {
    let mut lib = fresh().await;
    let first = add_track(lib.conn(), "/music/a.mp3", "A").await;
    let second = add_track(lib.conn(), "/music/b.mp3", "B").await;
    let third = add_track(lib.conn(), "/music/c.mp3", "C").await;

    youtube_mappings::upsert(lib.conn(), &first, "shared")
        .await
        .expect("cache");
    youtube_mappings::upsert(lib.conn(), &second, "shared")
        .await
        .expect("cache");
    youtube_mappings::upsert(lib.conn(), &third, "other")
        .await
        .expect("cache");

    let ids = youtube_mappings::all_youtube_ids(lib.conn())
        .await
        .expect("read");

    assert_eq!(ids.len(), 2);
    assert!(ids.contains("shared") && ids.contains("other"));
}

#[tokio::test]
async fn all_youtube_ids_is_empty_on_a_fresh_library() {
    let mut lib = fresh().await;

    assert!(
        youtube_mappings::all_youtube_ids(lib.conn())
            .await
            .expect("read")
            .is_empty()
    );
}

/// The foreign key cascades, which is what keeps this cache from outliving the
/// library. v1 relied on it too — nothing in `share.ts` ever deletes a mapping.
#[tokio::test]
async fn deleting_a_track_removes_its_mapping() {
    let mut lib = fresh().await;
    let track = add_track(lib.conn(), "/music/a.mp3", "A").await;
    youtube_mappings::upsert(lib.conn(), &track, "video-a")
        .await
        .expect("cache");

    shiranami_db::repo::tracks::remove(lib.conn(), &track)
        .await
        .expect("remove the track");

    assert_eq!(
        youtube_mappings::get_for_track(lib.conn(), &track)
            .await
            .expect("read"),
        None,
        "the FK is ON DELETE CASCADE and foreign_keys is ON"
    );
}
