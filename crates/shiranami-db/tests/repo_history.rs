//! The play-history repository: recording a play, and reading it back.
//!
//! Ported from the cases `apps/desktop/src/main/ipc/database.integration.test.ts`
//! covers for `db:history:record-play` and `db:history:get-recent`. The five
//! aggregate reads are in `repo_history_stats.rs`.

#[path = "support/activity.rs"]
mod activity;

use shiranami_core::constants::{UNKNOWN_ALBUM, UNKNOWN_ARTIST};
use shiranami_core::models::RecordPlayInput;
use shiranami_db::repo::history;

use activity::{TrackSeed, count_rows, fresh, insert_track, play, with_one_track};

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
