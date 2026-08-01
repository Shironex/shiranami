//! The similarity prefilter and the shelf cache, against a real database.
//!
//! The other half of `repo_recommendations.rs`, split from it only because one
//! file covering both grew past the module-shape cap. The distinctions asserted
//! here are the ones a "tidier" query would collapse: a candidate prefilter
//! that can match nothing issues no query at all, and a cached shelf with an
//! unparseable payload comes back raw rather than as an error.

#[path = "support/activity.rs"]
mod activity;

use shiranami_db::repo::recommendations;
use sqlx::SqliteConnection;

use activity::{exec, fresh};

/// Seed a track carrying the columns the shared `TrackSeed` does not cover.
async fn insert_tagged_track(
    conn: &mut SqliteConnection,
    id: &str,
    artist: Option<&str>,
    genre: Option<&str>,
    year: Option<i64>,
    is_favorite: bool,
) {
    sqlx::query(
        "INSERT INTO tracks (id, file_path, title, artist, album, genre, year, is_favorite, \
                             play_count) \
         VALUES (?1, ?2, ?3, ?4, 'Nocturne', ?5, ?6, ?7, 0)",
    )
    .bind(id)
    .bind(format!("/music/{id}.mp3"))
    .bind(id)
    .bind(artist)
    .bind(genre)
    .bind(year)
    .bind(is_favorite)
    .execute(conn)
    .await
    .unwrap_or_else(|error| panic!("seed tagged track `{id}`: {error}"));
}

// ── similarity ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn a_seed_that_left_the_library_reads_as_absent() {
    let mut fixture = fresh().await;

    let seed = recommendations::similarity_seed(fixture.conn(), "gone")
        .await
        .expect("read");

    assert!(
        seed.is_none(),
        "the renderer can ask for `more like this` on a track removed under it"
    );
}

#[tokio::test]
async fn shared_playlist_counts_tally_per_playlist_and_skip_the_seed() {
    let mut fixture = fresh().await;
    for id in ["t1", "t2", "t3"] {
        insert_tagged_track(fixture.conn(), id, Some("Aoi"), None, None, false).await;
    }
    exec(
        fixture.conn(),
        "INSERT INTO playlists (id, name) VALUES ('p1', 'One'), ('p2', 'Two')",
    )
    .await;
    exec(
        fixture.conn(),
        "INSERT INTO playlist_tracks (id, playlist_id, track_id, position) VALUES \
           ('m1', 'p1', 't1', 0), ('m2', 'p1', 't2', 1), \
           ('m3', 'p2', 't1', 0), ('m4', 'p2', 't2', 1), ('m5', 'p2', 't3', 2)",
    )
    .await;

    let counts = recommendations::shared_playlist_counts(fixture.conn(), "t1")
        .await
        .expect("read");

    assert_eq!(counts.get("t2"), Some(&2), "t2 shares both playlists");
    assert_eq!(counts.get("t3"), Some(&1));
    assert!(!counts.contains_key("t1"), "the seed never counts itself");
}

#[tokio::test]
async fn a_seed_in_no_playlist_has_no_co_members() {
    let mut fixture = fresh().await;
    insert_tagged_track(fixture.conn(), "t1", Some("Aoi"), None, None, false).await;

    let counts = recommendations::shared_playlist_counts(fixture.conn(), "t1")
        .await
        .expect("read");

    assert!(counts.is_empty());
}

/// v1's `if (axisClauses.length === 0) return []`. With no matchable axis the
/// pool is empty *without* a query — the alternative, a bare `WHERE id != seed`,
/// would return the whole library for every untagged track.
#[tokio::test]
async fn a_candidate_pool_with_no_matchable_axis_is_empty() {
    let mut fixture = fresh().await;
    for id in ["t1", "t2"] {
        insert_tagged_track(fixture.conn(), id, Some("Aoi"), None, None, false).await;
    }

    let candidates = recommendations::similarity_candidates(fixture.conn(), "t1", None, None, &[])
        .await
        .expect("read");

    assert!(candidates.is_empty());
}

#[tokio::test]
async fn the_candidate_pool_unions_every_matchable_axis_and_excludes_the_seed() {
    let mut fixture = fresh().await;
    // t1 is the seed; t2 shares the artist, t3 shares nothing but is a
    // playlist co-member, t4 shares neither and must not appear.
    insert_tagged_track(fixture.conn(), "t1", Some("Aoi"), None, None, false).await;
    insert_tagged_track(fixture.conn(), "t2", Some("Aoi"), None, None, false).await;
    insert_tagged_track(fixture.conn(), "t3", Some("Other"), None, None, false).await;
    insert_tagged_track(fixture.conn(), "t4", Some("Nobody"), None, None, false).await;

    let candidates = recommendations::similarity_candidates(
        fixture.conn(),
        "t1",
        Some("Aoi"),
        None,
        &["t3".to_owned()],
    )
    .await
    .expect("read");

    let mut ids: Vec<String> = candidates.into_iter().map(|row| row.track_id).collect();
    ids.sort();

    assert_eq!(ids, vec!["t2".to_owned(), "t3".to_owned()]);
}

/// Every track shares the default album in this fixture, so the album axis
/// alone is enough to build a pool — and the seed is still excluded from it.
#[tokio::test]
async fn the_album_axis_builds_a_pool_on_its_own() {
    let mut fixture = fresh().await;
    for id in ["t1", "t2"] {
        insert_tagged_track(fixture.conn(), id, Some("Aoi"), None, None, false).await;
    }

    let candidates =
        recommendations::similarity_candidates(fixture.conn(), "t1", None, Some("Nocturne"), &[])
            .await
            .expect("read");

    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].track_id, "t2");
}

// ── the shelf cache ────────────────────────────────────────────────────────

#[tokio::test]
async fn a_shelf_that_was_never_written_reads_as_absent() {
    let mut fixture = fresh().await;

    let shelf = recommendations::read_shelf(fixture.conn(), "library")
        .await
        .expect("read");

    assert!(shelf.is_none());
}

#[tokio::test]
async fn writing_a_shelf_twice_replaces_it_rather_than_erroring() {
    let mut fixture = fresh().await;

    recommendations::write_shelf(fixture.conn(), "library", "[]", "2026-06-01T00:00:00.000Z")
        .await
        .expect("write");
    recommendations::write_shelf(
        fixture.conn(),
        "library",
        r#"[{"trackId":"t1"}]"#,
        "2026-06-02T00:00:00.000Z",
    )
    .await
    .expect("overwrite");

    let shelf = recommendations::read_shelf(fixture.conn(), "library")
        .await
        .expect("read")
        .expect("a cached row");

    assert_eq!(shelf.payload, r#"[{"trackId":"t1"}]"#);
    assert_eq!(shelf.generated_at, "2026-06-02T00:00:00.000Z");
}

/// The payload comes back as text. v1 treated an unparseable one as a stale,
/// empty shelf rather than as a failed channel, and that is only expressible if
/// the query never tries to parse it.
#[tokio::test]
async fn an_unparseable_payload_is_returned_raw_rather_than_erroring() {
    let mut fixture = fresh().await;

    recommendations::write_shelf(
        fixture.conn(),
        "library",
        "not json",
        "2026-06-01T00:00:00.000Z",
    )
    .await
    .expect("write");

    let shelf = recommendations::read_shelf(fixture.conn(), "library")
        .await
        .expect("the read succeeds")
        .expect("a cached row");

    assert_eq!(shelf.payload, "not json");
}

/// Invalidation is per kind: marking a track "not interested" drops the library
/// shelf and must leave discover alone, because recomputing discover spawns
/// yt-dlp.
#[tokio::test]
async fn deleting_one_shelf_leaves_the_other_alone() {
    let mut fixture = fresh().await;
    recommendations::write_shelf(fixture.conn(), "library", "[]", "2026-06-01T00:00:00.000Z")
        .await
        .expect("write");
    recommendations::write_shelf(fixture.conn(), "discover", "[]", "2026-06-01T00:00:00.000Z")
        .await
        .expect("write");

    recommendations::delete_shelf(fixture.conn(), "library")
        .await
        .expect("invalidate");

    assert!(
        recommendations::read_shelf(fixture.conn(), "library")
            .await
            .expect("read")
            .is_none()
    );
    assert!(
        recommendations::read_shelf(fixture.conn(), "discover")
            .await
            .expect("read")
            .is_some()
    );
}
