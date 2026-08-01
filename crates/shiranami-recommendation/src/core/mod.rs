//! The pure scoring core, ported 1:1 from `packages/recommendation/src`.
//!
//! Everything here is plain data in, ranked data out — no database, no yt-dlp,
//! no IPC. The desktop (and, later, mobile) adapters project their own storage
//! into these shapes and consume the ranked output; keeping the core data-only
//! is what lets one algorithm be shared across platforms that do not share a
//! data layer. That is the same charter the TypeScript package carried, and it
//! is why this is the warm-up port: the whole thing is testable with
//! `cargo test -p shiranami-recommendation`, with no sqlite and no webview.
//!
//! **This is a numerical port, so the arithmetic is a compatibility surface.**
//! A v2 install must rank a user's library exactly as v1 did, so every module
//! reproduces the TypeScript semantics — including its quirks — and each
//! deliberate quirk carries a comment saying which v1 behaviour it preserves.
//! Rust idiom governs the *shape* (owned types, `Option` knobs, exhaustive
//! `match`); TypeScript governs the *math*.
//!
//! Module map, mirroring the TypeScript files one-for-one:
//!
//! | TypeScript            | Rust             |
//! | --------------------- | ---------------- |
//! | `src/types.ts`        | [`types`]        |
//! | `src/affinity.ts`     | [`affinity`]     |
//! | `src/similarity.ts`   | [`similarity`]   |
//! | `src/mixes.ts`        | [`mixes`]        |
//! | (`Date.parse` / `Date.now`) | [`instant`] |

pub mod affinity;
pub mod instant;
pub mod mixes;
pub mod similarity;
pub mod types;

pub use affinity::{
    DEFAULT_ARTIST_DISLIKE_PENALTY, affinity_score, rank_by_affinity, select_seed_tracks,
};
pub use mixes::{MixTrack, SMART_MIX_LIMIT, build_smart_mixes};
pub use similarity::{rank_by_similarity, similarity_score};
pub use types::{
    AffinityOptions, ScoredTrack, SharedPlaylistCounts, SimilarTrack, SimilarityTrack,
    SimilarityWeights, TrackStats,
};
