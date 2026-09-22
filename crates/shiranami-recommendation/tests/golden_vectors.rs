//! Differential test against the TypeScript implementation.
//!
//! The ported suites next door prove the Rust core satisfies the same
//! *assertions* the TypeScript one did. This file proves something stronger and
//! more specific to a numerical port: that on a broad input sweep the two
//! produce the same *numbers*, not merely numbers that pass the same tests.
//!
//! `fixtures/golden.json` was produced by running `packages/recommendation` (the
//! v1 TypeScript, before it is deleted at cutover — architecture Phase 20) over
//! a generated input sweep and recording both sides: every `stats` / `pool` /
//! `mixTracks` entry is a recorded **input**, every `score` / `similarity` /
//! `mixes` entry the **output** TypeScript produced for it. It regenerates by
//! replaying the recorded inputs through `affinityScore`, `rankByAffinity`,
//! `similarityScore`, `rankBySimilarity` and `buildSmartMixes` with
//! `{ now: nowMs }`.
//!
//! The sweep covers play counts across three orders of magnitude, completion
//! ratios on and outside the clamp bounds, ages from fresh to a year stale,
//! every half-life and favorite-boost knob, the favorite / disliked /
//! artist-disliked signals, sentinel and empty tags, shared-playlist folding,
//! and all nine weather buckets against four hours of the day.

use std::collections::HashMap;

use serde::Deserialize;
use shiranami_core::models::{SmartMixResult, SmartMixSignals, SmartMixWeather};
use shiranami_recommendation::core::{
    AffinityOptions, MixTrack, SharedPlaylistCounts, SimilarityTrack, SimilarityWeights,
    TrackStats, affinity_score, build_smart_mixes, rank_by_affinity, rank_by_similarity,
    similarity_score,
};

/// Relative tolerance for a recorded score.
///
/// Measured, not guessed: at zero tolerance every similarity score, every mix
/// and every ranking *order* is bit-identical, and 85 of the 90 affinity scores
/// are too. The five that are not differ by exactly one ULP (worst relative
/// deviation 1.8e-16), all of them on the `0.5^(age/half-life)` factor —
/// `Math.pow` and `f64::powf` are the same operation on the same hardware but
/// not the same code. Every other step is exact IEEE-754 arithmetic.
///
/// 1e-15 is roughly four ULPs: loose enough for that last bit, far too tight
/// for a real formula divergence to hide in.
const RELATIVE_EPSILON: f64 = 1e-15;

#[track_caller]
fn assert_same_number(actual: f64, expected: f64, what: &str) {
    let tolerance = RELATIVE_EPSILON * expected.abs().max(1.0);
    assert!(
        (actual - expected).abs() <= tolerance,
        "{what}: TypeScript produced {expected}, Rust produced {actual}"
    );
}

// ---------------------------------------------------------------------------
// The recorded fixture.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Golden {
    now_ms: i64,
    affinity: Vec<AffinityCase>,
    ranking: Vec<RankedEntry>,
    similarity: SimilarityCase,
    mix_tracks: Vec<GoldenMixTrack>,
    mixes: Vec<MixCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AffinityCase {
    stats: GoldenStats,
    half_life_days: Option<f64>,
    favorite_boost: Option<f64>,
    score: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenStats {
    track_id: String,
    title: String,
    artist: String,
    album: String,
    plays: u32,
    avg_completion: f64,
    last_played_at: String,
    is_favorite: bool,
    is_disliked: bool,
    artist_dislikes: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RankedEntry {
    track_id: String,
    score: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimilarityCase {
    pool: Vec<GoldenSimilarityTrack>,
    shared_playlists: HashMap<String, u32>,
    scores: Vec<RankedEntry>,
    ranked: Vec<SimilarEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenSimilarityTrack {
    track_id: String,
    artist: String,
    album: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimilarEntry {
    track_id: String,
    similarity: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoldenMixTrack {
    track_id: String,
    genre: Option<String>,
    year: Option<i32>,
    play_count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MixCase {
    hour: u8,
    weather: Option<SmartMixWeather>,
    mixes: Vec<SmartMixResult>,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("fixtures/golden.json")).expect("golden.json parses")
}

impl From<&GoldenStats> for TrackStats {
    fn from(recorded: &GoldenStats) -> Self {
        Self {
            track_id: recorded.track_id.clone(),
            title: recorded.title.clone(),
            artist: recorded.artist.clone(),
            album: recorded.album.clone(),
            plays: recorded.plays,
            avg_completion: recorded.avg_completion,
            last_played_at: recorded.last_played_at.clone(),
            is_favorite: recorded.is_favorite,
            is_disliked: recorded.is_disliked,
            artist_dislikes: recorded.artist_dislikes,
        }
    }
}

impl From<&GoldenSimilarityTrack> for SimilarityTrack {
    fn from(recorded: &GoldenSimilarityTrack) -> Self {
        Self {
            track_id: recorded.track_id.clone(),
            artist: recorded.artist.clone(),
            album: recorded.album.clone(),
        }
    }
}

impl From<&GoldenMixTrack> for MixTrack {
    fn from(recorded: &GoldenMixTrack) -> Self {
        Self {
            track_id: recorded.track_id.clone(),
            genre: recorded.genre.clone(),
            year: recorded.year,
            play_count: recorded.play_count,
        }
    }
}

// ---------------------------------------------------------------------------
// The vectors.
// ---------------------------------------------------------------------------

#[test]
fn affinity_scores_match_the_typescript_implementation() {
    let golden = golden();
    assert!(golden.affinity.len() >= 90, "the sweep shrank");

    for case in &golden.affinity {
        let options = AffinityOptions {
            half_life_days: case.half_life_days,
            favorite_boost: case.favorite_boost,
            artist_dislike_penalty: None,
            now_ms: Some(golden.now_ms),
        };
        let actual = affinity_score(&TrackStats::from(&case.stats), &options);
        assert_same_number(
            actual,
            case.score,
            &format!("affinity {}", case.stats.track_id),
        );
    }
}

#[test]
fn the_affinity_ranking_matches_the_typescript_implementation() {
    let golden = golden();
    let pool: Vec<TrackStats> = golden
        .affinity
        .iter()
        .map(|case| TrackStats::from(&case.stats))
        .collect();

    let ranked = rank_by_affinity(
        &pool,
        &AffinityOptions {
            now_ms: Some(golden.now_ms),
            ..AffinityOptions::default()
        },
    );

    let actual_ids: Vec<&str> = ranked.iter().map(|track| track.track_id.as_str()).collect();
    let expected_ids: Vec<&str> = golden
        .ranking
        .iter()
        .map(|entry| entry.track_id.as_str())
        .collect();
    // Order is the whole point: it decides which tracks become RD-mix seeds.
    assert_eq!(actual_ids, expected_ids, "ranking order diverged");

    for (track, expected) in ranked.iter().zip(&golden.ranking) {
        assert_same_number(
            track.score,
            expected.score,
            &format!("ranked {}", expected.track_id),
        );
    }
}

#[test]
fn similarity_scores_and_ranking_match_the_typescript_implementation() {
    let golden = golden();
    let pool: Vec<SimilarityTrack> = golden
        .similarity
        .pool
        .iter()
        .map(SimilarityTrack::from)
        .collect();
    let seed = pool.first().cloned().expect("the seed leads the pool");
    let shared: SharedPlaylistCounts = golden.similarity.shared_playlists.clone();
    let weights = SimilarityWeights::default();

    for (candidate, expected) in pool.iter().zip(&golden.similarity.scores) {
        let count = shared.get(&candidate.track_id).copied().unwrap_or(0);
        let actual = similarity_score(&seed, candidate, count, &weights);
        assert_same_number(
            actual,
            expected.score,
            &format!("similarity {}", expected.track_id),
        );
    }

    let ranked = rank_by_similarity(&seed, &pool, &shared, &weights);
    let actual: Vec<(&str, f64)> = ranked
        .iter()
        .map(|track| (track.track_id.as_str(), track.similarity))
        .collect();
    let expected: Vec<(&str, f64)> = golden
        .similarity
        .ranked
        .iter()
        .map(|entry| (entry.track_id.as_str(), entry.similarity))
        .collect();
    assert_eq!(actual, expected, "similarity ranking diverged");
}

#[test]
fn smart_mixes_match_the_typescript_implementation() {
    let golden = golden();
    let tracks: Vec<MixTrack> = golden.mix_tracks.iter().map(MixTrack::from).collect();
    assert_eq!(golden.mixes.len(), 36, "the signal sweep shrank");

    for case in &golden.mixes {
        let signals = SmartMixSignals {
            hour: case.hour,
            weather: case.weather,
        };
        let actual = build_smart_mixes(&tracks, &signals);
        // Whole-struct equality: id, kind, both i18n keys, the decade and the
        // ranked track ids, in order.
        assert_eq!(
            actual, case.mixes,
            "mixes diverged for hour {} weather {:?}",
            case.hour, case.weather
        );
    }
}
