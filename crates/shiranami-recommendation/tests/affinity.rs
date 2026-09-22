//! Ported from `packages/recommendation/src/affinity.test.ts`.
//!
//! Every case in the TypeScript suite has a counterpart here, against the same
//! fixture: the `stats()` factory becomes [`stats`] + struct-update syntax, and
//! the frozen `NOW` is the same instant. Two mechanical substitutions:
//!
//! * `toBeCloseTo(x, 5)` (5 decimal places) becomes [`assert_close`] at 1e-9 —
//!   tighter than the TypeScript tolerance, because this is a numerical port and
//!   the two implementations should agree to within `powf`'s last bits, not
//!   merely to five decimals. `toBe(0)` stays exact.
//! * the "does not leak the internal field" test, which read `Object.keys`,
//!   becomes an exhaustive destructure — the Rust way to fail when the struct
//!   grows a field.

use shiranami_recommendation::core::{
    AffinityOptions, ScoredTrack, TrackStats, affinity_score, rank_by_affinity, select_seed_tracks,
};

/// The frozen `Date.parse('2026-05-23T12:00:00.000Z')` from the TypeScript
/// fixture, in epoch milliseconds.
const NOW: i64 = 1_779_537_600_000;

/// How far two scores may differ and still count as the same number. Far
/// tighter than the suite's `toBeCloseTo(…, 5)`; a numerical port that needed
/// more slack than this would be hiding a real divergence.
const EPSILON: f64 = 1e-9;

/// `expect(actual).toBeCloseTo(expected, 5)`, at [`EPSILON`].
#[track_caller]
fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < EPSILON,
        "expected {expected}, got {actual} (difference {})",
        (actual - expected).abs()
    );
}

/// The fixture's `daysAgo(days)`: an ISO-8601 instant that many days before
/// [`NOW`]. A negative day is in the future, as in the TypeScript.
///
/// The TypeScript computed these with `new Date(NOW - days * 86_400_000)
/// .toISOString()`. Here they are the literal strings that expression produced,
/// so the fixture carries no date formatter of its own — the port already
/// hand-rolls the parsing direction, and a fixture that shared that code could
/// agree with a bug in it.
fn days_ago(days: i64) -> String {
    let iso = match days {
        -10 => "2026-06-02T12:00:00.000Z",
        0 => "2026-05-23T12:00:00.000Z",
        1 => "2026-05-22T12:00:00.000Z",
        2 => "2026-05-21T12:00:00.000Z",
        5 => "2026-05-18T12:00:00.000Z",
        6 => "2026-05-17T12:00:00.000Z",
        7 => "2026-05-16T12:00:00.000Z",
        14 => "2026-05-09T12:00:00.000Z",
        30 => "2026-04-23T12:00:00.000Z",
        other => unreachable!("the fixture has no recorded instant for {other} days ago"),
    };
    iso.to_owned()
}

/// The suite's `stats()` factory. Callers override with struct-update syntax
/// the way the TypeScript passed a `Partial<TrackStats>`.
fn stats() -> TrackStats {
    TrackStats {
        track_id: "t1".to_owned(),
        title: "Track One".to_owned(),
        artist: "Artist".to_owned(),
        album: "Album".to_owned(),
        plays: 10,
        avg_completion: 1.0,
        last_played_at: days_ago(0),
        is_favorite: false,
        is_disliked: false,
        artist_dislikes: 0,
    }
}

/// `{ now: NOW }` — the frozen reference instant every case scores against.
fn at_now() -> AffinityOptions {
    AffinityOptions {
        now_ms: Some(NOW),
        ..AffinityOptions::default()
    }
}

// ---------------------------------------------------------------------------
// describe('affinityScore')
// ---------------------------------------------------------------------------

#[test]
fn returns_zero_for_a_track_with_no_plays() {
    let track = TrackStats {
        plays: 0,
        ..stats()
    };
    assert_eq!(affinity_score(&track, &at_now()), 0.0);
}

#[test]
fn returns_zero_for_an_unparseable_last_played_at() {
    let track = TrackStats {
        last_played_at: "not-a-date".to_owned(),
        ..stats()
    };
    assert_eq!(affinity_score(&track, &at_now()), 0.0);
}

#[test]
fn equals_plays_times_completion_when_played_just_now() {
    let track = TrackStats {
        plays: 8,
        avg_completion: 0.5,
        ..stats()
    };
    assert_close(affinity_score(&track, &at_now()), 8.0 * 0.5 * 1.0);
}

#[test]
fn halves_the_score_after_one_half_life() {
    let options = AffinityOptions {
        half_life_days: Some(14.0),
        ..at_now()
    };
    let fresh = affinity_score(
        &TrackStats {
            last_played_at: days_ago(0),
            ..stats()
        },
        &options,
    );
    let aged = affinity_score(
        &TrackStats {
            last_played_at: days_ago(14),
            ..stats()
        },
        &options,
    );
    assert_close(aged, fresh / 2.0);
}

#[test]
fn applies_the_favorite_boost_multiplicatively() {
    let options = AffinityOptions {
        favorite_boost: Some(0.5),
        ..at_now()
    };
    let plain = affinity_score(
        &TrackStats {
            is_favorite: false,
            ..stats()
        },
        &options,
    );
    let favorite = affinity_score(
        &TrackStats {
            is_favorite: true,
            ..stats()
        },
        &options,
    );
    assert_close(favorite, plain * 1.5);
}

#[test]
fn clamps_completion_above_one_and_below_zero() {
    let over = affinity_score(
        &TrackStats {
            avg_completion: 5.0,
            ..stats()
        },
        &at_now(),
    );
    let exact = affinity_score(
        &TrackStats {
            avg_completion: 1.0,
            ..stats()
        },
        &at_now(),
    );
    assert_close(over, exact);

    let under = affinity_score(
        &TrackStats {
            avg_completion: -3.0,
            ..stats()
        },
        &at_now(),
    );
    assert_eq!(under, 0.0);
}

#[test]
fn treats_a_future_timestamp_as_age_zero() {
    let future = affinity_score(
        &TrackStats {
            last_played_at: days_ago(-10),
            ..stats()
        },
        &at_now(),
    );
    let present = affinity_score(
        &TrackStats {
            last_played_at: days_ago(0),
            ..stats()
        },
        &at_now(),
    );
    assert_close(future, present);
}

#[test]
fn uses_the_default_half_life_when_given_an_invalid_one() {
    let aged = TrackStats {
        last_played_at: days_ago(14),
        ..stats()
    };
    let with_zero = affinity_score(
        &aged,
        &AffinityOptions {
            half_life_days: Some(0.0),
            ..at_now()
        },
    );
    let with_default = affinity_score(&aged, &at_now());
    assert_close(with_zero, with_default);
}

#[test]
fn returns_zero_for_an_explicitly_disliked_track_regardless_of_plays() {
    let track = TrackStats {
        plays: 100,
        avg_completion: 1.0,
        is_disliked: true,
        ..stats()
    };
    assert_eq!(affinity_score(&track, &at_now()), 0.0);
}

#[test]
fn softly_downranks_a_track_whose_artist_has_dislikes() {
    let score_with = |artist_dislikes| {
        affinity_score(
            &TrackStats {
                artist_dislikes,
                ..stats()
            },
            &at_now(),
        )
    };
    let plain = score_with(0);
    // 1 / (1 + 1×1) = 0.5 ; 1 / (1 + 1×2) = 1/3
    assert_close(score_with(1), plain * 0.5);
    assert_close(score_with(2), plain / 3.0);
}

#[test]
fn respects_a_custom_artist_dislike_penalty() {
    let plain = affinity_score(
        &TrackStats {
            artist_dislikes: 0,
            ..stats()
        },
        &at_now(),
    );
    let damped = affinity_score(
        &TrackStats {
            artist_dislikes: 2,
            ..stats()
        },
        &AffinityOptions {
            artist_dislike_penalty: Some(0.5),
            ..at_now()
        },
    );
    // 1 / (1 + 0.5×2) = 0.5
    assert_close(damped, plain * 0.5);
}

#[test]
fn treats_a_missing_or_negative_artist_dislikes_as_no_penalty() {
    let plain = affinity_score(&stats(), &at_now());
    let negative = affinity_score(
        &TrackStats {
            artist_dislikes: -5,
            ..stats()
        },
        &at_now(),
    );
    assert_close(negative, plain);
}

// ---------------------------------------------------------------------------
// describe('rankByAffinity')
// ---------------------------------------------------------------------------

fn ids(ranked: &[ScoredTrack]) -> Vec<&str> {
    ranked.iter().map(|track| track.track_id.as_str()).collect()
}

#[test]
fn ranks_higher_affinity_tracks_first() {
    let pool = [
        TrackStats {
            track_id: "low".to_owned(),
            plays: 1,
            last_played_at: days_ago(30),
            ..stats()
        },
        TrackStats {
            track_id: "high".to_owned(),
            plays: 50,
            last_played_at: days_ago(0),
            ..stats()
        },
        TrackStats {
            track_id: "mid".to_owned(),
            plays: 10,
            last_played_at: days_ago(7),
            ..stats()
        },
    ];
    assert_eq!(
        ids(&rank_by_affinity(&pool, &at_now())),
        ["high", "mid", "low"]
    );
}

#[test]
fn drops_tracks_that_score_zero() {
    let pool = [
        TrackStats {
            track_id: "keep".to_owned(),
            ..stats()
        },
        TrackStats {
            track_id: "drop".to_owned(),
            plays: 0,
            ..stats()
        },
    ];
    assert_eq!(ids(&rank_by_affinity(&pool, &at_now())), ["keep"]);
}

#[test]
fn breaks_ties_by_most_recent_play() {
    // Freeze decay (infinite half-life) so both tracks score identically despite
    // different ages — the recency tie-break on the parsed instant then decides.
    let pool = [
        TrackStats {
            track_id: "older".to_owned(),
            last_played_at: days_ago(6),
            ..stats()
        },
        TrackStats {
            track_id: "newer".to_owned(),
            last_played_at: days_ago(5),
            ..stats()
        },
    ];
    let ranked = rank_by_affinity(
        &pool,
        &AffinityOptions {
            half_life_days: Some(f64::INFINITY),
            ..at_now()
        },
    );
    assert_eq!(ids(&ranked), ["newer", "older"]);
}

#[test]
fn does_not_leak_the_internal_last_played_field() {
    let ranked = rank_by_affinity(&[stats()], &at_now());
    let first = ranked.first().expect("one track ranked");
    // The `Object.keys(...)` assertion, as an exhaustive destructure: adding a
    // field to `ScoredTrack` — the recency key the ranker carries internally
    // being the one that matters — stops compiling here.
    let ScoredTrack {
        track_id,
        title,
        artist,
        album,
        score,
    } = first;
    assert_eq!(track_id, "t1");
    assert_eq!(title, "Track One");
    assert_eq!(artist, "Artist");
    assert_eq!(album, "Album");
    assert!(*score > 0.0);
}

#[test]
fn returns_an_empty_vector_for_empty_input() {
    assert!(rank_by_affinity(&[], &at_now()).is_empty());
}

#[test]
fn drops_disliked_tracks_and_downranks_artist_disliked_ones() {
    let pool = [
        TrackStats {
            track_id: "disliked".to_owned(),
            plays: 100,
            is_disliked: true,
            ..stats()
        },
        TrackStats {
            track_id: "artist-hit".to_owned(),
            plays: 20,
            artist_dislikes: 3,
            ..stats()
        },
        TrackStats {
            track_id: "clean".to_owned(),
            plays: 12,
            ..stats()
        },
    ];
    // disliked dropped; clean (12) outranks artist-hit (20 / (1+3) = 5).
    assert_eq!(
        ids(&rank_by_affinity(&pool, &at_now())),
        ["clean", "artist-hit"]
    );
}

// ---------------------------------------------------------------------------
// describe('selectSeedTracks')
// ---------------------------------------------------------------------------

fn seed_pool() -> Vec<TrackStats> {
    vec![
        TrackStats {
            track_id: "a".to_owned(),
            plays: 100,
            last_played_at: days_ago(0),
            ..stats()
        },
        TrackStats {
            track_id: "b".to_owned(),
            plays: 50,
            last_played_at: days_ago(1),
            ..stats()
        },
        TrackStats {
            track_id: "c".to_owned(),
            plays: 10,
            last_played_at: days_ago(2),
            ..stats()
        },
    ]
}

#[test]
fn returns_the_top_n_seeds() {
    let seeds = select_seed_tracks(&seed_pool(), 2, &at_now());
    assert_eq!(ids(&seeds), ["a", "b"]);
}

#[test]
fn returns_empty_when_count_is_zero() {
    // The TypeScript also covered `count: -1`; `usize` makes that
    // unrepresentable, so the guard collapses onto this case.
    assert!(select_seed_tracks(&seed_pool(), 0, &at_now()).is_empty());
}

#[test]
fn returns_all_available_seeds_when_count_exceeds_the_pool() {
    assert_eq!(select_seed_tracks(&seed_pool(), 99, &at_now()).len(), 3);
}

// ---------------------------------------------------------------------------
// Fixture self-check — the ISO helper above is test-only scaffolding, so it is
// pinned against the literal the TypeScript fixture produced.
// ---------------------------------------------------------------------------

#[test]
fn the_fixture_clock_matches_the_typescript_one() {
    assert_eq!(days_ago(0), "2026-05-23T12:00:00.000Z");
    assert_eq!(days_ago(14), "2026-05-09T12:00:00.000Z");
    assert_eq!(days_ago(-10), "2026-06-02T12:00:00.000Z");
}
