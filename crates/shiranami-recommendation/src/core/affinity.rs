//! Listening-affinity scoring, ported from
//! `packages/recommendation/src/affinity.ts`.
//!
//! Ranks tracks the user already plays by how much they seem to love them, so
//! the desktop adapter can pick the strongest seeds for a "more of what you
//! play" shelf and for yt-dlp RD-mix discovery.
//!
//! The formula mirrors the data-lens query 5a: a recency-decayed,
//! completion-weighted play count, lifted by a favorite boost, and damped by an
//! explicit "not interested" (skip/dislike) signal — a disliked track is dropped
//! outright, and a track whose artist has been disliked elsewhere is softly
//! downranked.

use crate::core::instant;
use crate::core::types::{AffinityOptions, ScoredTrack, TrackStats};

const DEFAULT_HALF_LIFE_DAYS: f64 = 14.0;
const DEFAULT_FAVORITE_BOOST: f64 = 0.5;

/// Default per-dislike artist penalty — one artist-level dislike halves the
/// score (`1 / (1 + 1×1)` = 0.5), two cut it to a third, and so on.
pub const DEFAULT_ARTIST_DISLIKE_PENALTY: f64 = 1.0;

const MS_PER_DAY: f64 = 24.0 * 60.0 * 60.0 * 1000.0;

/// Compute the affinity score for a single track's stats.
///
/// `plays × avg_completion` is the base engagement, decayed by how long ago the
/// track was last played (exponential half-life), then lifted by the favorite
/// boost. Completion acts as a quality gate — a track played many times but
/// always abandoned early scores below one played fewer times to completion.
///
/// Returns 0 for tracks with no plays, an unparseable `last_played_at`, or an
/// explicitly disliked track ([`TrackStats::is_disliked`]) — the user said "not
/// interested", so it is never surfaced again. A future timestamp is clamped to
/// "now" (no negative ages, so a skewed clock cannot amplify a score).
pub fn affinity_score(stats: &TrackStats, options: &AffinityOptions) -> f64 {
    // `options.halfLifeDays && options.halfLifeDays > 0 ? … : DEFAULT`: 0, a
    // negative and a NaN are all falsy-or-not-positive in TypeScript and all
    // fall back here, while a positive infinity is honoured (it freezes decay,
    // which is how the ranker's tie-break test isolates the tie-break).
    let half_life_days = match options.half_life_days {
        Some(days) if days > 0.0 => days,
        _ => DEFAULT_HALF_LIFE_DAYS,
    };
    // `??`, not `||`: an explicit 0 boost is a real answer, not a missing one.
    let favorite_boost = options.favorite_boost.unwrap_or(DEFAULT_FAVORITE_BOOST);
    let artist_dislike_penalty = options
        .artist_dislike_penalty
        .unwrap_or(DEFAULT_ARTIST_DISLIKE_PENALTY);
    let now = options.now_ms.unwrap_or_else(instant::now_ms);

    if stats.plays == 0 {
        return 0.0;
    }
    // Explicit "not interested" on this exact track — drop it entirely so it is
    // never re-surfaced, regardless of how heavily it was played before.
    if stats.is_disliked {
        return 0.0;
    }
    // `Date.parse` returning NaN scored 0; `None` is the same answer.
    let Some(last_played_ms) = instant::parse_iso8601_ms(&stats.last_played_at) else {
        return 0.0;
    };

    // Clamp completion into [0, 1] so a malformed row can't inflate the score,
    // and clamp age at 0 so a clock-skewed future timestamp doesn't amplify it.
    let completion = clamp01(stats.avg_completion);
    let age_days = (((now - last_played_ms) as f64) / MS_PER_DAY).max(0.0);
    let recency = 0.5_f64.powf(age_days / half_life_days);

    let base = f64::from(stats.plays) * completion * recency;
    let boost = if stats.is_favorite {
        1.0 + favorite_boost
    } else {
        1.0
    };

    // Soft artist-level penalty: each "not interested" on another track by this
    // artist shrinks the score toward 0 without ever erasing it or going
    // negative. The dislike count is clamped at 0 so a malformed count can't
    // amplify the score.
    let artist_dislikes = stats.artist_dislikes.max(0) as f64;
    let penalty = 1.0 / (1.0 + js_max_zero(artist_dislike_penalty) * artist_dislikes);

    base * boost * penalty
}

/// Score every track and return them ranked by affinity, highest first.
///
/// Ties break on more recent `last_played_at` (matching the Overview top-tracks
/// tie-break, `ORDER BY COUNT(*) DESC, MAX(played_at) DESC`). Tracks scoring 0
/// are dropped so seed selection never picks a never-engaged track.
pub fn rank_by_affinity(stats: &[TrackStats], options: &AffinityOptions) -> Vec<ScoredTrack> {
    let mut ranked: Vec<(ScoredTrack, i64)> = stats
        .iter()
        .filter_map(|track| {
            let score = affinity_score(track, options);
            // Kept only on a strictly positive score, which is also how
            // TypeScript's `.filter(s => s.score > 0)` dropped a NaN: `NaN > 0`
            // is false there and `NaN > 0.0` is false here.
            if score <= 0.0 || score.is_nan() {
                return None;
            }
            // A positive score means `last_played_at` parsed, so this second
            // parse — which TypeScript also performed — cannot fail. Expressing
            // that as a `?` rather than an unwrap keeps the impossible case
            // impossible instead of merely improbable.
            let last_played_ms = instant::parse_iso8601_ms(&track.last_played_at)?;
            let scored = ScoredTrack {
                track_id: track.track_id.clone(),
                title: track.title.clone(),
                artist: track.artist.clone(),
                album: track.album.clone(),
                score,
            };
            Some((scored, last_played_ms))
        })
        .collect();

    // Stable, like V8's sort: equal score *and* equal recency keeps input order.
    ranked.sort_by(|(left, left_played), (right, right_played)| {
        right
            .score
            .total_cmp(&left.score)
            .then(right_played.cmp(left_played))
    });

    ranked.into_iter().map(|(scored, _)| scored).collect()
}

/// Convenience wrapper: the top-N seed tracks by affinity. The desktop adapter
/// resolves these to `youtube_mappings.youtubeId` for RD-mix discovery.
///
/// TypeScript guarded `count <= 0`; `usize` makes the negative half of that
/// guard unrepresentable, and 0 still yields an empty result through `take`.
pub fn select_seed_tracks(
    stats: &[TrackStats],
    count: usize,
    options: &AffinityOptions,
) -> Vec<ScoredTrack> {
    rank_by_affinity(stats, options)
        .into_iter()
        .take(count)
        .collect()
}

/// Clamp a number to the inclusive [0, 1] range — the port of `clamp01` from
/// `packages/shared/src/utils.ts`.
///
/// A non-finite input returns the **minimum**, not the nearest bound: the shared
/// helper's `if (!Number.isFinite(value)) return min;` line is there so a NaN
/// cannot poison the result downstream, which means `clamp01(Infinity)` is 0 and
/// not 1. Ported as-is, because a v1 row that scored 0 must still score 0.
fn clamp01(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    value.clamp(0.0, 1.0)
}

/// `Math.max(0, value)`, including the NaN behaviour.
///
/// Rust's `f64::max` *discards* a NaN operand and would quietly turn a NaN knob
/// into a penalty of 1.0 — keeping a track TypeScript would have dropped (its
/// NaN score fails the `> 0` filter). JavaScript's `Math.max` propagates NaN
/// instead, so this does too.
fn js_max_zero(value: f64) -> f64 {
    if value.is_nan() {
        return f64::NAN;
    }
    value.max(0.0)
}
