//! The play-history repository, against real databases.
//!
//! Ported from the cases `apps/desktop/src/main/ipc/database.integration.test.ts`
//! covers for `db:history:*`, plus the ones it does not: the aggregate queries
//! were only checked for shape there, and their *grouping* is what silently
//! changes a user's stats card. Where a test pins something subtle, the comment
//! says what breaks if it is "simplified".

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::constants::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_core::models::RecordPlayInput;
use shiranami_db::repo::history;

use activity::{Fixture, PlaySeed, TrackSeed, count_rows, fresh, insert_play, insert_track};

/// A play at `played_at` on `track_id`, with an id derived from the timestamp
/// so tests do not have to invent unique ones.
async fn play(fixture: &mut Fixture, id: &str, track_id: &str, played_at: &str) {
    insert_play(
        fixture.conn(),
        &PlaySeed {
            id,
            track_id,
            played_at,
            ..PlaySeed::default()
        },
    )
    .await;
}

/// A fixture with one track, `t1` by "Aoi" on "Nocturne", 200 seconds long.
async fn with_one_track() -> Fixture {
    let mut fixture = fresh().await;
    insert_track(fixture.conn(), &TrackSeed::default()).await;
    fixture
}

// ── record_play ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn recording_a_play_inserts_the_row_and_bumps_the_track() {
    let mut fixture = with_one_track().await;

    let recorded = history::record_play(
        fixture.conn(),
        "h-new",
        "2026-06-01T12:00:00.000Z",
        &RecordPlayInput {
            track_id: "t1".to_owned(),
            played_seconds: 200.0,
            duration: Some(200.0),
            source: None,
        },
    )
    .await
    .expect("the play must record");

    assert_eq!(recorded.entry.id, "h-new");
    assert_eq!(recorded.entry.track_id, "t1");
    assert_eq!(recorded.entry.played_at, "2026-06-01T12:00:00.000Z");
    assert!((recorded.entry.completion_ratio - 1.0).abs() < f64::EPSILON);
    assert!(recorded.entry.completed);
    assert_eq!(
        recorded.entry.source, "library",
        "an absent source defaults to `library`, as v1's `?? 'library'` did"
    );

    // The scrobbler's tags come back from the same transaction rather than a
    // second read, which is the only reason the UPDATE has a RETURNING clause.
    let track = recorded.track.expect("the updated track's tags");
    assert_eq!(track.title, "Alpha");
    assert_eq!(
        track.artist.as_deref(),
        Some("Aoi"),
        "the scrobbler needs the raw tag, not the display sentinel"
    );

    assert_eq!(
        activity::play_count(fixture.conn(), "t1").await,
        Some(1),
        "`tracks.play_count` is a lifetime counter and must advance with the play"
    );
}

#[tokio::test]
async fn the_completion_math_matches_v1_branch_for_branch() {
    let mut fixture = with_one_track().await;

    // (played_seconds, duration) → (ratio, completed)
    let cases = [
        // A known length: the ratio is the fraction heard, and 95% completes.
        (100.0, Some(200.0), 0.5, false),
        (190.0, Some(200.0), 0.95, true),
        (200.0, Some(200.0), 1.0, true),
        // Heard longer than the track claims — clamped, never above 1.
        (400.0, Some(200.0), 1.0, true),
        // No length at all: nothing to be a fraction of.
        (100.0, None, 0.0, false),
        // A zero duration is falsy in v1's `duration && duration > 0`, so both
        // the ratio and the completion flag fall through to their defaults —
        // and crucially there is no division by zero.
        (100.0, Some(0.0), 0.0, false),
        // A negative duration is *truthy* in JavaScript, so `completed` is
        // evaluated rather than short-circuited — against a ratio of 0, which
        // still leaves it false. Same answer, different route; pinned because
        // a Rust `if let Some(d)` written without care changes the route.
        (100.0, Some(-5.0), 0.0, false),
        // Negative seconds clamp to zero rather than producing a negative ratio.
        (-30.0, Some(200.0), 0.0, false),
    ];

    for (index, (played_seconds, duration, ratio, completed)) in cases.into_iter().enumerate() {
        let id = format!("h{index}");
        let recorded = history::record_play(
            fixture.conn(),
            &id,
            "2026-06-01T12:00:00.000Z",
            &RecordPlayInput {
                track_id: "t1".to_owned(),
                played_seconds,
                duration,
                source: None,
            },
        )
        .await
        .expect("the play must record");

        assert!(
            (recorded.entry.completion_ratio - ratio).abs() < 1e-12,
            "played {played_seconds} of {duration:?}: expected ratio {ratio}, got {}",
            recorded.entry.completion_ratio
        );
        assert_eq!(
            recorded.entry.completed, completed,
            "played {played_seconds} of {duration:?}: expected completed {completed}"
        );
        assert!(
            recorded.entry.played_seconds >= 0.0,
            "seconds heard are clamped at zero"
        );
    }
}

#[tokio::test]
async fn a_play_on_an_unknown_track_writes_nothing_at_all() {
    let mut fixture = with_one_track().await;

    let error = history::record_play(
        fixture.conn(),
        "h-orphan",
        "2026-06-01T12:00:00.000Z",
        &RecordPlayInput {
            track_id: "does-not-exist".to_owned(),
            played_seconds: 10.0,
            duration: Some(200.0),
            source: None,
        },
    )
    .await;

    assert!(
        error.is_err(),
        "the foreign key on play_history.track_id must refuse an orphan play"
    );
    // The point of the transaction: a refused insert leaves no half-written
    // state behind, and in particular has not bumped anyone's play count.
    assert_eq!(count_rows(fixture.conn(), "play_history").await, 0);
    assert_eq!(activity::play_count(fixture.conn(), "t1").await, Some(0));
}

#[tokio::test]
async fn a_null_play_count_is_coalesced_rather_than_poisoned() {
    let mut fixture = fresh().await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            play_count: None,
            ..TrackSeed::default()
        },
    )
    .await;

    history::record_play(
        fixture.conn(),
        "h1",
        "2026-06-01T12:00:00.000Z",
        &RecordPlayInput {
            track_id: "t1".to_owned(),
            played_seconds: 200.0,
            duration: Some(200.0),
            source: None,
        },
    )
    .await
    .expect("the play must record");

    // `NULL + 1` is NULL. Without the COALESCE this track's play count would
    // stay NULL forever, silently un-counting every future play.
    assert_eq!(activity::play_count(fixture.conn(), "t1").await, Some(1));
}

#[tokio::test]
async fn an_explicit_source_is_preserved() {
    let mut fixture = with_one_track().await;

    let recorded = history::record_play(
        fixture.conn(),
        "h1",
        "2026-06-01T12:00:00.000Z",
        &RecordPlayInput {
            track_id: "t1".to_owned(),
            played_seconds: 30.0,
            duration: None,
            source: Some("radio".to_owned()),
        },
    )
    .await
    .expect("the play must record");

    assert_eq!(recorded.entry.source, "radio");
}

// ── recent ────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn recent_returns_newest_first() {
    let mut fixture = with_one_track().await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;
    play(&mut fixture, "h2", "t1", "2026-06-03T10:00:00.000Z").await;
    play(&mut fixture, "h3", "t1", "2026-06-02T10:00:00.000Z").await;

    let rows = history::recent(fixture.conn(), None, None)
        .await
        .expect("the history must read");

    let ids: Vec<_> = rows.iter().map(|row| row.id.as_str()).collect();
    assert_eq!(ids, ["h2", "h3", "h1"]);
}

#[tokio::test]
async fn recent_collapses_a_missing_artist_and_album_onto_the_sentinels() {
    let mut fixture = fresh().await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            artist: None,
            album: None,
            ..TrackSeed::default()
        },
    )
    .await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;

    let rows = history::recent(fixture.conn(), None, None)
        .await
        .expect("the history must read");

    // The wire type declares these non-null and the renderer prints them
    // directly, so a NULL reaching it would render the string "null".
    assert_eq!(rows[0].artist, UNKNOWN_ARTIST);
    assert_eq!(rows[0].album, UNKNOWN_ALBUM);
}

#[tokio::test]
async fn recent_honours_the_since_bound_inclusively() {
    let mut fixture = with_one_track().await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;
    play(&mut fixture, "h2", "t1", "2026-06-02T10:00:00.000Z").await;

    let rows = history::recent(fixture.conn(), None, Some("2026-06-02T10:00:00.000Z"))
        .await
        .expect("the history must read");

    let ids: Vec<_> = rows.iter().map(|row| row.id.as_str()).collect();
    assert_eq!(
        ids,
        ["h2"],
        "`since` is `>=`, so its own instant is included"
    );
}

#[tokio::test]
async fn recent_clamps_its_page_size_to_v1s_bounds() {
    let mut fixture = with_one_track().await;
    for index in 0..101 {
        let id = format!("h{index:03}");
        // Distinct, ordered timestamps so the limit is the only thing varying.
        let at = format!("2026-06-01T{:02}:{:02}:00.000Z", index / 60, index % 60);
        play(&mut fixture, &id, "t1", &at).await;
    }

    let default = history::recent(fixture.conn(), None, None)
        .await
        .expect("the history must read");
    assert_eq!(default.len(), 30, "no limit means 30");

    let huge = history::recent(fixture.conn(), Some(1_000), None)
        .await
        .expect("the history must read");
    assert_eq!(huge.len(), 100, "an oversized limit clamps to 100");

    let zero = history::recent(fixture.conn(), Some(0), None)
        .await
        .expect("the history must read");
    assert_eq!(
        zero.len(),
        1,
        "a zero or negative limit clamps up to 1, never to `LIMIT 0`"
    );
}

// ── summary ───────────────────────────────────────────────────────────────────

/// Two artists, three tracks, five plays — the shared shape for the summary
/// assertions below.
async fn with_a_small_library() -> Fixture {
    let mut fixture = fresh().await;
    for seed in [
        TrackSeed {
            id: "t1",
            title: "Alpha",
            artist: Some("Aoi"),
            album: Some("Nocturne"),
            duration: Some(200.0),
            ..TrackSeed::default()
        },
        TrackSeed {
            id: "t2",
            title: "Beta",
            artist: Some("Aoi"),
            album: Some("Nocturne"),
            duration: Some(180.0),
            ..TrackSeed::default()
        },
        TrackSeed {
            id: "t3",
            title: "Gamma",
            artist: Some("Kaze"),
            album: Some("Drift"),
            duration: Some(240.0),
            ..TrackSeed::default()
        },
    ] {
        insert_track(fixture.conn(), &seed).await;
    }

    // t1 ×3, t2 ×1, t3 ×1.
    for (id, track, at, seconds, completed) in [
        ("h1", "t1", "2026-06-01T10:00:00.000Z", 200.0, true),
        ("h2", "t1", "2026-06-01T11:00:00.000Z", 200.0, true),
        ("h3", "t1", "2026-06-02T10:00:00.000Z", 60.0, false),
        ("h4", "t2", "2026-06-02T11:00:00.000Z", 180.0, true),
        ("h5", "t3", "2026-06-03T10:00:00.000Z", 120.0, false),
    ] {
        insert_play(
            fixture.conn(),
            &PlaySeed {
                id,
                track_id: track,
                played_at: at,
                played_seconds: seconds,
                completed,
                ..PlaySeed::default()
            },
        )
        .await;
    }

    fixture
}

#[tokio::test]
async fn the_summary_totals_add_up() {
    let mut fixture = with_a_small_library().await;

    let summary = history::summary(fixture.conn(), None, None)
        .await
        .expect("the summary must read");

    assert_eq!(summary.total_plays, 5);
    assert_eq!(summary.unique_tracks, 3);
    assert_eq!(summary.unique_artists, 2);
    assert_eq!(summary.completed_plays, 3);
    // (200 + 200 + 60 + 180 + 120) / 60
    assert!((summary.total_minutes - 12.666_666_666_666_666).abs() < 1e-9);
}

#[tokio::test]
async fn the_summary_is_empty_rather_than_absent_for_a_window_with_no_plays() {
    let mut fixture = with_a_small_library().await;

    let summary = history::summary(fixture.conn(), Some("2030-01-01T00:00:00.000Z"), None)
        .await
        .expect("the summary must read");

    // An aggregate with no GROUP BY returns a row even over nothing, which is
    // what lets this be zeros instead of an error or a `None`.
    assert_eq!(summary.total_plays, 0);
    assert!((summary.total_minutes - 0.0).abs() < f64::EPSILON);
    assert!(summary.top_tracks.is_empty());
    assert!(summary.top_artists.is_empty());
}

#[tokio::test]
async fn the_top_tracks_rank_by_plays_then_by_recency() {
    let mut fixture = with_a_small_library().await;

    let summary = history::summary(fixture.conn(), None, None)
        .await
        .expect("the summary must read");

    let ids: Vec<_> = summary
        .top_tracks
        .iter()
        .map(|track| track.track_id.as_str())
        .collect();
    // t1 has 3 plays; t2 and t3 have 1 each, so the tie breaks on the later
    // play — t3 (June 3) above t2 (June 2). Without that tie-break the pair
    // would reorder arbitrarily between runs.
    assert_eq!(ids, ["t1", "t3", "t2"]);

    let top = &summary.top_tracks[0];
    assert_eq!(
        top.play_count, 3,
        "the window's plays, not tracks.play_count"
    );
    assert!((top.listened_seconds - 460.0).abs() < 1e-9);
    assert_eq!(top.last_played_at, "2026-06-02T10:00:00.000Z");
}

#[tokio::test]
async fn the_top_artists_rank_by_plays_then_by_time_listened() {
    let mut fixture = with_a_small_library().await;

    let summary = history::summary(fixture.conn(), None, None)
        .await
        .expect("the summary must read");

    let artists: Vec<_> = summary
        .top_artists
        .iter()
        .map(|artist| (artist.artist.as_str(), artist.play_count))
        .collect();
    assert_eq!(artists, [("Aoi", 4), ("Kaze", 1)]);
    assert!((summary.top_artists[0].listened_seconds - 640.0).abs() < 1e-9);
}

#[tokio::test]
async fn untagged_tracks_do_not_merge_with_ones_tagged_unknown_artist() {
    let mut fixture = fresh().await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t1",
            artist: None,
            ..TrackSeed::default()
        },
    )
    .await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t2",
            artist: Some(UNKNOWN_ARTIST),
            ..TrackSeed::default()
        },
    )
    .await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;
    play(&mut fixture, "h2", "t2", "2026-06-01T11:00:00.000Z").await;

    let summary = history::summary(fixture.conn(), None, None)
        .await
        .expect("the summary must read");

    // Both render as "Unknown Artist", but they are two different groups: one
    // is "we don't know", the other is a band that is actually called that.
    // Folding the COALESCE into the GROUP BY would merge them and quietly
    // double one artist's count. `COUNT(DISTINCT artist)` meanwhile skips the
    // NULL entirely, which is why `unique_artists` is 1 and not 2.
    assert_eq!(summary.top_artists.len(), 2);
    assert!(
        summary
            .top_artists
            .iter()
            .all(|artist| artist.artist == UNKNOWN_ARTIST)
    );
    assert_eq!(
        summary.unique_artists, 1,
        "COUNT(DISTINCT …) does not count NULL"
    );
}

#[tokio::test]
async fn the_summary_window_excludes_its_upper_bound() {
    let mut fixture = with_a_small_library().await;

    let summary = history::summary(
        fixture.conn(),
        Some("2026-06-01T00:00:00.000Z"),
        Some("2026-06-02T00:00:00.000Z"),
    )
    .await
    .expect("the summary must read");

    // Only June 1's two plays. The exclusive upper bound is what lets the
    // renderer ask for "the previous seven days" without double-counting the
    // instant the two windows share.
    assert_eq!(summary.total_plays, 2);
}

// ── activity ──────────────────────────────────────────────────────────────────

#[tokio::test]
async fn activity_buckets_by_calendar_day_oldest_first() {
    let mut fixture = with_a_small_library().await;

    let points = history::activity(fixture.conn(), None)
        .await
        .expect("the activity must read");

    let days: Vec<_> = points
        .iter()
        .map(|point| (point.date.as_str(), point.play_count))
        .collect();
    assert_eq!(
        days,
        [("2026-06-01", 2), ("2026-06-02", 2), ("2026-06-03", 1)],
        "the day key is the first ten characters of the stored timestamp"
    );
    assert!((points[0].listened_minutes - 400.0 / 60.0).abs() < 1e-9);
}

#[tokio::test]
async fn activity_honours_the_since_bound() {
    let mut fixture = with_a_small_library().await;

    let points = history::activity(fixture.conn(), Some("2026-06-02T00:00:00.000Z"))
        .await
        .expect("the activity must read");

    let days: Vec<_> = points.iter().map(|point| point.date.as_str()).collect();
    assert_eq!(days, ["2026-06-02", "2026-06-03"]);
}

// ── hourly activity ───────────────────────────────────────────────────────────

#[tokio::test]
async fn hourly_activity_buckets_every_play_into_a_valid_local_cell() {
    let mut fixture = with_a_small_library().await;

    let points = history::hourly_activity(fixture.conn(), None)
        .await
        .expect("the hourly activity must read");

    // The bucket keys are localised, so their absolute values depend on the
    // machine's timezone and cannot be asserted directly. What must hold
    // anywhere: every play lands in exactly one cell, and every cell is a
    // real weekday and hour.
    let total: u32 = points.iter().map(|point| point.play_count).sum();
    assert_eq!(total, 5, "no play may be dropped or double-counted");
    assert!(
        points
            .iter()
            .all(|point| point.day_of_week <= 6 && point.hour <= 23),
        "`%w` is 0–6 and `%H` is 0–23; a parse failure would show up as a \
         silent 0 rather than an out-of-range value, so check the range"
    );

    // The five plays sit at five distinct (weekday, hour) pairs, and a uniform
    // timezone offset shifts all of them together — it can never collapse two
    // into one cell, because the gaps between them (1h, 23h, 1h, 23h) are not
    // multiples of a week. So the bucket count is assertable even though the
    // bucket *keys* are not.
    assert_eq!(points.len(), 5, "five plays, five distinct local cells");
    assert!(
        points.iter().all(|point| point.play_count == 1),
        "no two of these plays share a weekday-and-hour cell in any timezone"
    );
}

// ── weekly insights ───────────────────────────────────────────────────────────

#[tokio::test]
async fn a_gap_over_thirty_minutes_starts_a_new_session() {
    let mut fixture = with_one_track().await;
    for (id, at) in [
        // First play — always a session start.
        ("h1", "2026-06-01T12:00:00.000Z"),
        // Exactly 30 minutes later. v1's test is `> SESSION_GAP_MS`, strictly,
        // so the boundary itself continues the session rather than starting one.
        ("h2", "2026-06-01T12:30:00.000Z"),
        // One second past the boundary — a new session.
        ("h3", "2026-06-01T13:00:01.000Z"),
        // Well inside it — still the second session.
        ("h4", "2026-06-01T13:05:00.000Z"),
    ] {
        play(&mut fixture, id, "t1", at).await;
    }

    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");

    assert_eq!(insights.session_count, 2);
}

#[tokio::test]
async fn an_empty_window_has_no_sessions() {
    let mut fixture = with_one_track().await;

    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");

    assert_eq!(insights.session_count, 0);
    assert!(insights.top_albums.is_empty());
}

#[tokio::test]
async fn albums_group_on_the_album_artist_tag_not_the_track_artist() {
    let mut fixture = fresh().await;
    // A compilation: one album, two different track artists, one album-artist
    // tag holding them together.
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t1",
            artist: Some("Aoi"),
            album: Some("Drift"),
            album_artist: Some("Various Artists"),
            ..TrackSeed::default()
        },
    )
    .await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t2",
            artist: Some("Kaze"),
            album: Some("Drift"),
            album_artist: Some("Various Artists"),
            ..TrackSeed::default()
        },
    )
    .await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;
    play(&mut fixture, "h2", "t2", "2026-06-01T11:00:00.000Z").await;

    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");

    // Grouping on the track artist would split this into two one-play albums
    // and neither would reach the card.
    assert_eq!(insights.top_albums.len(), 1);
    assert_eq!(insights.top_albums[0].album, "Drift");
    assert_eq!(insights.top_albums[0].artist, "Various Artists");
    assert_eq!(insights.top_albums[0].play_count, 2);
}

#[tokio::test]
async fn an_untagged_album_falls_back_to_a_track_artist_then_to_the_sentinel() {
    let mut fixture = fresh().await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t1",
            artist: Some("Aoi"),
            album: Some("Nocturne"),
            // Whitespace only — `TRIM` then `NULLIF` treat it as absent, which
            // is why the expression is not a plain COALESCE.
            album_artist: Some("   "),
            ..TrackSeed::default()
        },
    )
    .await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t2",
            artist: None,
            album: Some("Drift"),
            album_artist: None,
            ..TrackSeed::default()
        },
    )
    .await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;
    play(&mut fixture, "h2", "t2", "2026-06-01T11:00:00.000Z").await;

    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");

    let by_album: std::collections::HashMap<_, _> = insights
        .top_albums
        .iter()
        .map(|album| (album.album.as_str(), album.artist.as_str()))
        .collect();
    assert_eq!(
        by_album["Nocturne"], "Aoi",
        "falls back to the track artist"
    );
    assert_eq!(
        by_album["Drift"], UNKNOWN_ARTIST,
        "with nothing to fall back to, the sentinel rather than a blank card"
    );
}

#[tokio::test]
async fn albums_with_no_title_are_left_out_of_the_chart() {
    let mut fixture = fresh().await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t1",
            album: None,
            ..TrackSeed::default()
        },
    )
    .await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t2",
            album: Some(""),
            ..TrackSeed::default()
        },
    )
    .await;
    insert_track(
        fixture.conn(),
        &TrackSeed {
            id: "t3",
            album: Some("Nocturne"),
            ..TrackSeed::default()
        },
    )
    .await;
    play(&mut fixture, "h1", "t1", "2026-06-01T10:00:00.000Z").await;
    play(&mut fixture, "h2", "t2", "2026-06-01T11:00:00.000Z").await;
    play(&mut fixture, "h3", "t3", "2026-06-01T12:00:00.000Z").await;

    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");

    // Both the NULL album and the empty-string album collapse to '' and are
    // dropped by the HAVING clause. In an untagged library that bucket would
    // otherwise be the single biggest "album" on the card.
    assert_eq!(insights.top_albums.len(), 1);
    assert_eq!(insights.top_albums[0].album, "Nocturne");
}

#[tokio::test]
async fn the_album_chart_keeps_the_top_five_by_play_count() {
    let mut fixture = fresh().await;
    // Six albums, each played a different number of times.
    for (index, plays) in (1..=6).enumerate() {
        let id = format!("t{index}");
        let album = format!("Album {index}");
        insert_track(
            fixture.conn(),
            &TrackSeed {
                id: &id,
                album: Some(&album),
                ..TrackSeed::default()
            },
        )
        .await;
        for play_index in 0..plays {
            let play_id = format!("h{index}-{play_index}");
            play(
                &mut fixture,
                &play_id,
                &id,
                &format!("2026-06-01T{:02}:{play_index:02}:00.000Z", index + 1),
            )
            .await;
        }
    }

    let insights = history::weekly_insights(fixture.conn(), None)
        .await
        .expect("the insights must read");

    assert_eq!(insights.top_albums.len(), 5, "the chart holds five");
    assert_eq!(
        insights.top_albums[0].play_count, 6,
        "ordered by plays, descending"
    );
    assert!(
        insights
            .top_albums
            .iter()
            .all(|album| album.album != "Album 0"),
        "the least played album is the one that falls off"
    );
}
