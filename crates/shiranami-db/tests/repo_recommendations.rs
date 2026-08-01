//! The recommendation reads and writes against a real database.
//!
//! These back no IPC channel, so the reference is v1's inline query sites in
//! `apps/desktop/src/main/services/recommendation-service.ts`. What that file
//! makes observable — and what is therefore asserted here — is the set of
//! distinctions a "tidier" query would collapse: an untagged artist is not the
//! sentinel, a dislike with a `NULL` artist penalises nobody, a candidate
//! prefilter that can match nothing issues no query at all, and a cached shelf
//! with an unparseable payload comes back raw rather than as an error.

#[path = "support/activity.rs"]
mod activity;

use shiranami_db::repo::recommendations;
use sqlx::{Row, SqliteConnection};

use activity::{PlaySeed, TrackSeed, exec, fresh, insert_play, insert_track};

/// Seed a track carrying the columns [`TrackSeed`] does not cover.
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

/// The `negative_signals` primary key for one track, which no caller reads but
/// which an upsert must not move.
async fn signal_row_id(conn: &mut SqliteConnection, track_id: &str) -> String {
    sqlx::query("SELECT id FROM negative_signals WHERE track_id = ?1")
        .bind(track_id)
        .fetch_one(conn)
        .await
        .expect("the signal row exists")
        .get("id")
}

// ── the grouped play aggregate ──────────────────────────────────────────────

#[tokio::test]
async fn play_stats_groups_one_row_per_track_with_its_engagement() {
    let mut fixture = fresh().await;
    insert_track(fixture.conn(), &TrackSeed::default()).await;
    insert_play(
        fixture.conn(),
        &PlaySeed {
            id: "h1",
            completion_ratio: 1.0,
            played_at: "2026-06-01T12:00:00.000Z",
            ..PlaySeed::default()
        },
    )
    .await;
    insert_play(
        fixture.conn(),
        &PlaySeed {
            id: "h2",
            completion_ratio: 0.5,
            played_at: "2026-06-02T12:00:00.000Z",
            ..PlaySeed::default()
        },
    )
    .await;

    let stats = recommendations::play_stats(fixture.conn())
        .await
        .expect("aggregate");

    assert_eq!(stats.len(), 1, "one row per track, not per play");
    assert_eq!(stats[0].plays, 2);
    assert!((stats[0].avg_completion - 0.75).abs() < f64::EPSILON);
    assert_eq!(
        stats[0].last_played_at, "2026-06-02T12:00:00.000Z",
        "MAX(played_at), which the recency decay is measured from"
    );
}

/// A track the user has never played contributes nothing. The `INNER JOIN` is
/// what makes seed selection skip a freshly imported library rather than
/// ranking it all at score 0.
#[tokio::test]
async fn play_stats_omits_tracks_that_were_never_played() {
    let mut fixture = fresh().await;
    insert_track(fixture.conn(), &TrackSeed::default()).await;

    let stats = recommendations::play_stats(fixture.conn())
        .await
        .expect("aggregate");

    assert!(stats.is_empty());
}

/// The scoring core distinguishes an untagged artist (`""`) from one genuinely
/// tagged "Unknown Artist", so the query must hand back the raw `NULL` rather
/// than collapsing it the way every display-facing read in this crate does.
#[tokio::test]
async fn play_stats_keeps_an_untagged_artist_null_rather_than_collapsing_it() {
    let mut fixture = fresh().await;
    insert_tagged_track(fixture.conn(), "t1", None, None, None, false).await;
    insert_play(fixture.conn(), &PlaySeed::default()).await;

    let stats = recommendations::play_stats(fixture.conn())
        .await
        .expect("aggregate");

    assert_eq!(
        stats[0].artist, None,
        "collapsing to the sentinel here would make every untagged track \
         match every other one on the artist axis"
    );
}

#[tokio::test]
async fn play_stats_reports_the_favorite_flag() {
    let mut fixture = fresh().await;
    insert_tagged_track(fixture.conn(), "t1", Some("Aoi"), None, None, true).await;
    insert_play(fixture.conn(), &PlaySeed::default()).await;

    let stats = recommendations::play_stats(fixture.conn())
        .await
        .expect("aggregate");

    assert!(stats[0].is_favorite);
}

// ── the negative signals ────────────────────────────────────────────────────

#[tokio::test]
async fn a_not_interested_mark_is_idempotent_on_the_track_and_keeps_its_row_id() {
    let mut fixture = fresh().await;
    insert_tagged_track(fixture.conn(), "t1", Some("Aoi"), None, None, false).await;

    recommendations::add_negative_signal(fixture.conn(), "n1", "t1", Some("Aoi"), "context-menu")
        .await
        .expect("mark");
    let first = signal_row_id(fixture.conn(), "t1").await;

    recommendations::add_negative_signal(fixture.conn(), "n2", "t1", Some("Renamed"), "shelf")
        .await
        .expect("re-mark");
    let second = signal_row_id(fixture.conn(), "t1").await;

    assert_eq!(
        first, second,
        "the conflict target is `track_id`, not the primary key — a re-mark \
         updates in place"
    );

    let counts = recommendations::artist_dislike_counts(fixture.conn())
        .await
        .expect("count");
    assert_eq!(counts.get("Renamed"), Some(&1), "the artist was refreshed");
    assert!(!counts.contains_key("Aoi"));
}

/// v1's `WHERE artist IS NOT NULL`. Without it every dislike of an untagged
/// track would land under one shared key and penalise every other untagged
/// track in the library.
#[tokio::test]
async fn a_dislike_with_no_artist_penalises_nobody() {
    let mut fixture = fresh().await;
    insert_tagged_track(fixture.conn(), "t1", None, None, None, false).await;
    insert_tagged_track(fixture.conn(), "t2", None, None, None, false).await;

    recommendations::add_negative_signal(fixture.conn(), "n1", "t1", None, "context-menu")
        .await
        .expect("mark");

    let counts = recommendations::artist_dislike_counts(fixture.conn())
        .await
        .expect("count");
    assert!(counts.is_empty());

    let disliked = recommendations::disliked_track_ids(fixture.conn())
        .await
        .expect("read");
    assert!(
        disliked.contains("t1"),
        "the track-level signal still applies — only the artist-level one does not"
    );
}

#[tokio::test]
async fn undoing_a_mark_that_was_never_made_is_not_an_error() {
    let mut fixture = fresh().await;

    recommendations::remove_negative_signal(fixture.conn(), "nobody")
        .await
        .expect("a no-op delete succeeds, as it did in v1");
}

/// The two `None`s are different answers and the caller branches on both: a
/// missing track is a silent no-op, an untagged one is a real signal.
#[tokio::test]
async fn track_artist_separates_a_missing_track_from_an_untagged_one() {
    let mut fixture = fresh().await;
    insert_tagged_track(fixture.conn(), "t1", None, None, None, false).await;
    insert_tagged_track(fixture.conn(), "t2", Some("Aoi"), None, None, false).await;

    assert_eq!(
        recommendations::track_artist(fixture.conn(), "gone")
            .await
            .expect("read"),
        None,
        "no such track"
    );
    assert_eq!(
        recommendations::track_artist(fixture.conn(), "t1")
            .await
            .expect("read"),
        Some(None),
        "the track exists and is untagged"
    );
    assert_eq!(
        recommendations::track_artist(fixture.conn(), "t2")
            .await
            .expect("read"),
        Some(Some("Aoi".to_owned()))
    );
}

// ── cover art and mix candidates ────────────────────────────────────────────

/// A miss is an absent entry, not an empty string: the shelf item's
/// `album_art` is `Option`, and a `Some("")` would make the renderer try to
/// load an image at the empty URL.
#[tokio::test]
async fn album_art_omits_tracks_with_none_cached() {
    let mut fixture = fresh().await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t1",
            album_art: Some("abc.jpg"),
            ..TrackSeed::default()
        },
    )
    .await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t2",
            album_art: None,
            ..TrackSeed::default()
        },
    )
    .await;

    let art = recommendations::album_art_for(
        fixture.conn(),
        &["t1".to_owned(), "t2".to_owned(), "gone".to_owned()],
    )
    .await
    .expect("read");

    assert_eq!(art.get("t1").map(String::as_str), Some("abc.jpg"));
    assert!(!art.contains_key("t2"));
    assert!(!art.contains_key("gone"));
}

#[tokio::test]
async fn album_art_for_no_tracks_issues_no_query() {
    let mut fixture = fresh().await;

    let art = recommendations::album_art_for(fixture.conn(), &[])
        .await
        .expect("read");

    assert!(art.is_empty());
}

/// A whole-table scan with no history join, so a library that has never been
/// played still produces mixes.
#[tokio::test]
async fn mix_tracks_reads_the_whole_library_including_unplayed_tracks() {
    let mut fixture = fresh().await;
    insert_tagged_track(
        fixture.conn(),
        "t1",
        Some("Aoi"),
        Some("lofi"),
        Some(1994),
        false,
    )
    .await;
    insert_tagged_track(fixture.conn(), "t2", Some("Aoi"), None, None, false).await;

    let mut rows = recommendations::mix_tracks(fixture.conn())
        .await
        .expect("read");
    rows.sort_by(|left, right| left.track_id.cmp(&right.track_id));

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].genre.as_deref(), Some("lofi"));
    assert_eq!(rows[0].year, Some(1994));
    assert_eq!(rows[1].genre, None);
    assert_eq!(rows[1].year, None);
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
