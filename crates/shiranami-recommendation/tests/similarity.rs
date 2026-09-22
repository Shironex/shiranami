//! Ported from `packages/recommendation/src/similarity.test.ts`.
//!
//! Every case in the TypeScript suite has a counterpart here, against the same
//! Nujabes / Modal Soul fixture. Scores are small exact integers in `f64`, so
//! `toBe(3)` ports as an exact `assert_eq!` — there is nothing to round.

use std::collections::HashMap;

use shiranami_recommendation::core::{
    SharedPlaylistCounts, SimilarTrack, SimilarityTrack, SimilarityWeights, rank_by_similarity,
    similarity_score,
};

/// The fixture seed.
fn seed() -> SimilarityTrack {
    SimilarityTrack {
        track_id: "seed".to_owned(),
        artist: "Nujabes".to_owned(),
        album: "Modal Soul".to_owned(),
    }
}

/// The suite's `candidate()` factory; callers override with struct-update
/// syntax the way the TypeScript passed a `Partial<SimilarityTrack>`.
fn candidate() -> SimilarityTrack {
    SimilarityTrack {
        track_id: "c".to_owned(),
        artist: "Other".to_owned(),
        album: "Other Album".to_owned(),
    }
}

/// `weights: SimilarityWeights = {}` — every knob at its default.
fn default_weights() -> SimilarityWeights {
    SimilarityWeights::default()
}

/// `sharedPlaylists: SharedPlaylistCounts = {}`.
fn no_shared_playlists() -> SharedPlaylistCounts {
    HashMap::new()
}

// ---------------------------------------------------------------------------
// describe('similarityScore')
// ---------------------------------------------------------------------------

#[test]
fn returns_zero_for_the_seed_itself() {
    assert_eq!(
        similarity_score(&seed(), &seed(), 0, &default_weights()),
        0.0
    );
}

#[test]
fn scores_a_shared_artist() {
    let same_artist = SimilarityTrack {
        artist: "Nujabes".to_owned(),
        ..candidate()
    };
    assert_eq!(
        similarity_score(&seed(), &same_artist, 0, &default_weights()),
        3.0
    );
}

#[test]
fn scores_a_shared_album() {
    let same_album = SimilarityTrack {
        album: "Modal Soul".to_owned(),
        ..candidate()
    };
    assert_eq!(
        similarity_score(&seed(), &same_album, 0, &default_weights()),
        2.0
    );
}

#[test]
fn sums_shared_artist_and_album() {
    let both = SimilarityTrack {
        artist: "Nujabes".to_owned(),
        album: "Modal Soul".to_owned(),
        ..candidate()
    };
    assert_eq!(similarity_score(&seed(), &both, 0, &default_weights()), 5.0);
}

#[test]
fn adds_per_shared_playlist_points() {
    assert_eq!(
        similarity_score(&seed(), &candidate(), 3, &default_weights()),
        3.0
    );
}

#[test]
fn does_not_match_on_the_unknown_artist_sentinel() {
    let unknown_seed = SimilarityTrack {
        track_id: "u".to_owned(),
        artist: "Unknown Artist".to_owned(),
        album: "Modal Soul".to_owned(),
    };
    let cand = SimilarityTrack {
        artist: "Unknown Artist".to_owned(),
        album: "Other Album".to_owned(),
        ..candidate()
    };
    // artist match suppressed; only real signals count → 0 here
    assert_eq!(
        similarity_score(&unknown_seed, &cand, 0, &default_weights()),
        0.0
    );
}

#[test]
fn does_not_match_on_the_unknown_album_sentinel() {
    let unknown_seed = SimilarityTrack {
        track_id: "u".to_owned(),
        artist: "Nujabes".to_owned(),
        album: "Unknown Album".to_owned(),
    };
    let cand = SimilarityTrack {
        artist: "Other".to_owned(),
        album: "Unknown Album".to_owned(),
        ..candidate()
    };
    assert_eq!(
        similarity_score(&unknown_seed, &cand, 0, &default_weights()),
        0.0
    );
}

#[test]
fn does_not_match_on_empty_artist_or_album() {
    let empty_seed = SimilarityTrack {
        track_id: "e".to_owned(),
        artist: String::new(),
        album: String::new(),
    };
    let cand = SimilarityTrack {
        artist: String::new(),
        album: String::new(),
        ..candidate()
    };
    assert_eq!(
        similarity_score(&empty_seed, &cand, 0, &default_weights()),
        0.0
    );
}

#[test]
fn respects_custom_weights() {
    let same_artist = SimilarityTrack {
        artist: "Nujabes".to_owned(),
        ..candidate()
    };
    // `sameAlbum` is deliberately left out: overriding two weights must leave
    // the third at its default, which is what the TypeScript object spread did.
    let weights = SimilarityWeights {
        same_artist: Some(10.0),
        per_shared_playlist: Some(5.0),
        ..SimilarityWeights::default()
    };
    assert_eq!(
        similarity_score(&seed(), &same_artist, 2, &weights),
        10.0 + 2.0 * 5.0
    );
}

// ---------------------------------------------------------------------------
// describe('rankBySimilarity')
// ---------------------------------------------------------------------------

/// The fixture candidate pool, seed included so the self-match drop is covered.
fn pool() -> Vec<SimilarityTrack> {
    vec![
        SimilarityTrack {
            track_id: "same-artist".to_owned(),
            artist: "Nujabes".to_owned(),
            album: "Spiritual State".to_owned(),
        },
        SimilarityTrack {
            track_id: "same-album".to_owned(),
            artist: "Cise Starr".to_owned(),
            album: "Modal Soul".to_owned(),
        },
        SimilarityTrack {
            track_id: "unrelated".to_owned(),
            artist: "Random".to_owned(),
            album: "Random Album".to_owned(),
        },
        SimilarityTrack {
            track_id: "seed".to_owned(),
            artist: "Nujabes".to_owned(),
            album: "Modal Soul".to_owned(),
        },
    ]
}

fn ids(ranked: &[SimilarTrack]) -> Vec<&str> {
    ranked.iter().map(|track| track.track_id.as_str()).collect()
}

#[test]
fn ranks_by_similarity_and_drops_zero_overlap_and_the_seed() {
    let ranked = rank_by_similarity(&seed(), &pool(), &no_shared_playlists(), &default_weights());
    assert_eq!(ids(&ranked), ["same-artist", "same-album"]);
}

#[test]
fn folds_in_shared_playlist_counts() {
    let shared: SharedPlaylistCounts = HashMap::from([("unrelated".to_owned(), 4)]);
    let ranked = rank_by_similarity(&seed(), &pool(), &shared, &default_weights());
    // unrelated now scores 4 (4 shared playlists), above same-artist (3)
    assert_eq!(
        ranked.first().map(|track| track.track_id.as_str()),
        Some("unrelated")
    );
}

#[test]
fn returns_empty_when_nothing_overlaps() {
    let candidates = [SimilarityTrack {
        track_id: "x".to_owned(),
        artist: "A".to_owned(),
        album: "B".to_owned(),
    }];
    let ranked = rank_by_similarity(
        &seed(),
        &candidates,
        &no_shared_playlists(),
        &default_weights(),
    );
    assert!(ranked.is_empty());
}

// ---------------------------------------------------------------------------
// Beyond the TypeScript suite: the tie order the TypeScript got from V8's
// stable sort is load-bearing for the "More like this" list, so it is pinned
// rather than left to `sort_by`'s documented-but-unasserted stability.
// ---------------------------------------------------------------------------

#[test]
fn equal_scores_keep_input_order() {
    let candidates = [
        SimilarityTrack {
            track_id: "first".to_owned(),
            artist: "Nujabes".to_owned(),
            album: "A".to_owned(),
        },
        SimilarityTrack {
            track_id: "second".to_owned(),
            artist: "Nujabes".to_owned(),
            album: "B".to_owned(),
        },
        SimilarityTrack {
            track_id: "third".to_owned(),
            artist: "Nujabes".to_owned(),
            album: "C".to_owned(),
        },
    ];
    let ranked = rank_by_similarity(
        &seed(),
        &candidates,
        &no_shared_playlists(),
        &default_weights(),
    );
    assert_eq!(ids(&ranked), ["first", "second", "third"]);
}
