//! Input/output shapes for the pure recommendation scoring core, ported from
//! `packages/recommendation/src/types.ts`.
//!
//! Everything here is plain data — no DB rows, no IPC, no yt-dlp. Two shape
//! conventions carry the TypeScript meaning into Rust:
//!
//! 1. **`foo?: number` becomes a plain field with a `Default`.** The TypeScript
//!    optionals existed so callers and fixtures predating a signal kept working;
//!    every one of them read `?? 0` / `?? false` at the point of use, so the
//!    Rust field is non-optional and [`Default`] supplies the same zero. Struct
//!    update syntax (`TrackStats { plays: 10, ..Default::default() }`) reads the
//!    way the TypeScript `Partial<>` fixtures did.
//! 2. **Knobs stay `Option`.** An [`AffinityOptions`] field is genuinely
//!    tri-state — absent means "use the default", and `Some(0.0)` is a real,
//!    different answer from absent. Collapsing those would change the math.

use std::collections::HashMap;

/// Per-track listening signal aggregated from `play_history` + `tracks`. One
/// entry per track the user has actually played. `plays` / `avg_completion` /
/// `last_played_at` come straight from the grouped affinity query; the content
/// axes (`artist`/`album`) and `is_favorite` come from the joined `tracks` row.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TrackStats {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display title — passed through for the caller, not used in scoring.
    pub title: String,
    /// Display artist.
    pub artist: String,
    /// Display album.
    pub album: String,
    /// Total `play_history` rows for this track (frequency signal).
    ///
    /// `COUNT(*)` cannot go negative, so TypeScript's `plays <= 0` guard is
    /// `plays == 0` here; the unsigned type makes the other half unrepresentable
    /// rather than merely unreachable.
    pub plays: u32,
    /// Mean `completion_ratio` across those plays, 0..1 (engagement depth).
    pub avg_completion: f64,
    /// ISO-8601 timestamp of the most recent play (recency signal). Parsed by
    /// [`crate::core::instant::parse_iso8601_ms`]; unparseable scores 0.
    pub last_played_at: String,
    /// Explicit positive signal — boosts affinity when set.
    pub is_favorite: bool,
    /// Explicit negative signal — the user marked this exact track "not
    /// interested". When set, the track is dropped from affinity ranking
    /// entirely (it scores 0) so it is never re-surfaced. See
    /// [`AffinityOptions::artist_dislike_penalty`] for the softer artist-level
    /// signal.
    pub is_disliked: bool,
    /// Number of distinct "not interested" marks against OTHER tracks by this
    /// track's artist. A positive value softly downranks the track — the user
    /// disliked the artist's other work, so they probably want less of it, but a
    /// single dislike should not bury an artist they otherwise play heavily.
    ///
    /// Signed, and clamped at 0 during scoring: TypeScript guarded a malformed
    /// negative count with `Math.max(0, …)`, and an unsigned field here would
    /// delete that guard along with the test that pins it.
    pub artist_dislikes: i64,
}

/// A track scored and ranked by listening affinity.
///
/// The field set is the contract: the TypeScript ranker carried an internal
/// `lastPlayedMs` for its tie-break and stripped it before returning, with a
/// test asserting the leak never happens. `tests/affinity.rs` pins the same
/// thing by destructuring this struct exhaustively.
#[derive(Debug, Clone, PartialEq)]
pub struct ScoredTrack {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display title.
    pub title: String,
    /// Display artist.
    pub artist: String,
    /// Display album.
    pub album: String,
    /// Composite affinity score; higher means a stronger seed candidate.
    pub score: f64,
}

/// Knobs for the affinity score. Defaults match the data-lens query 5a.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct AffinityOptions {
    /// Recency half-life in days. A play contributes `0.5^(age_days/half_life)`
    /// of its weight, so a 14-day half-life means a two-week-old play counts
    /// half as much as a fresh one. Must be > 0; anything else falls back to the
    /// default.
    pub half_life_days: Option<f64>,
    /// Multiplicative boost applied to favorited tracks (e.g. 0.5 → +50%).
    pub favorite_boost: Option<f64>,
    /// Per-dislike penalty applied to a track whose ARTIST has "not interested"
    /// marks on other tracks. The track's score is multiplied by
    /// `1 / (1 + artist_dislike_penalty × artist_dislikes)`, so each
    /// artist-level dislike shrinks the score asymptotically toward 0 without
    /// ever turning it negative or fully erasing a heavily-played artist. An
    /// explicitly disliked track ([`TrackStats::is_disliked`]) is dropped
    /// outright and never reaches this penalty. Defaults to
    /// [`DEFAULT_ARTIST_DISLIKE_PENALTY`](crate::core::affinity::DEFAULT_ARTIST_DISLIKE_PENALTY).
    pub artist_dislike_penalty: Option<f64>,
    /// Reference instant for the recency decay, in epoch milliseconds. Defaults
    /// to [`now_ms`](crate::core::instant::now_ms). Injectable so tests are
    /// deterministic and the caller can score against a fixed "as of" time.
    pub now_ms: Option<i64>,
}

/// Minimal track shape for content-based similarity. Includes the candidate's
/// id plus the two reliable content axes (artist/album). Genre is deliberately
/// excluded — it is sparse / single-valued in this schema (research §10.2).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SimilarityTrack {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display artist; compared against the seed's, sentinels excluded.
    pub artist: String,
    /// Display album; compared against the seed's, sentinels excluded.
    pub album: String,
}

/// Playlist co-membership counts for a seed: for each candidate track id, how
/// many playlists it shares with the seed. The desktop adapter computes this
/// with the join in data-lens query 5b; the core just folds it into the score.
pub type SharedPlaylistCounts = HashMap<String, u32>;

/// A candidate scored by content similarity to a seed track.
#[derive(Debug, Clone, PartialEq)]
pub struct SimilarTrack {
    /// Local `tracks.id`.
    pub track_id: String,
    /// Display artist.
    pub artist: String,
    /// Display album.
    pub album: String,
    /// Similarity score; higher means more content overlap with the seed.
    pub similarity: f64,
}

/// Weights for content-similarity signals. Defaults match data-lens query 5b.
///
/// Every field is independently optional because TypeScript spread the caller's
/// partial object over the defaults (`{ ...DEFAULT_WEIGHTS, ...weights }`) —
/// overriding one weight must leave the other two at their defaults.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SimilarityWeights {
    /// Points for a shared, non-sentinel artist.
    pub same_artist: Option<f64>,
    /// Points for a shared, non-sentinel album.
    pub same_album: Option<f64>,
    /// Points per shared playlist membership.
    pub per_shared_playlist: Option<f64>,
}
