//! The I/O half: storage projected into [`crate::core`]'s shapes, and back.
//!
//! Ported from `apps/desktop/src/main/services/recommendation-service.ts`. The
//! scoring itself is [`crate::core`] and is not touched here — this module is
//! the adapter that `core`'s charter deliberately leaves out: it reads
//! `shiranami_db::repo::recommendations`, folds the rows into [`TrackStats`],
//! [`MixTrack`] and [`SimilarityTrack`], calls the ranker, and writes the
//! answer back into the shelf cache.
//!
//! [`TrackStats`]: crate::core::TrackStats
//! [`MixTrack`]: crate::core::MixTrack
//! [`SimilarityTrack`]: crate::core::SimilarityTrack
//!
//! # Why this is a crate and not six command bodies
//!
//! The six `recommendations:*` channels are thin in v1 too — every one of them
//! is a one-line delegation into this file. What sits behind them is not thin:
//! shelf staleness, the JSON payload round-trip, the three-query fold, seed
//! selection and the similarity prefilter are about 250 lines of decisions,
//! and §2.1 puts decisions in a crate and wiring in the composition root.
//!
//! # Every entry point takes `&mut SqliteConnection` and an instant
//!
//! Two ambient inputs v1 read from globals are parameters here, for the same
//! reason `shiranami_db::repo::history::record_play` takes them:
//!
//! - **The connection.** `shiranami_db`'s pool holds exactly one, so nothing
//!   below `AppState::conn` may acquire; the command layer acquires once and
//!   passes `&mut *conn` down through every call in this module.
//! - **`now_ms`.** v1 called `Date.now()` inside `affinityScore` and
//!   `new Date().toISOString()` inside the cache writer, which is why its
//!   recency decay could not be tested without mocking the clock. The instant
//!   arrives as an argument, so a shelf can be scored "as of" a fixed time and
//!   the TTL boundary is assertable rather than approximable.
//!
//! # Discovery is two halves, and both are here
//!
//! v1's `computeDiscoverItems` spawns yt-dlp against a seed's `RD` mix, four at
//! a time, and merges the results. The seed half —
//! [`discover_seed_youtube_ids`], which selects seeds by affinity and resolves
//! them through `repo::youtube_mappings` in **affinity order** — shipped with
//! the rest of this module; the fetch half needed a process runner and landed
//! after Phase 16 booted one, as [`discover`] describes.
//!
//! The fetch is **three calls, not one**, and that shape is the connection
//! discipline rather than a taste: [`discover_plan`] reads,
//! [`DiscoverFetcher::fetch`] spawns yt-dlp with no connection held, and
//! [`commit_discover`] writes. The pool has a single connection and a fan-out
//! takes seconds; `shiranami_metadata::enrich::batch` is the precedent for
//! splitting a long external run out of the connection's scope.
//!
//! [`refresh`] therefore rebuilds only the library shelf, and the composition
//! root — which owns the process runner and the yt-dlp path (§2.3) — drives the
//! discover half around it.

mod discover;
mod shelves;
mod signals;
mod similar;
mod stats;

pub use discover::{DiscoverFetcher, DiscoverPlan};
pub use shelves::{
    LIBRARY_MAX_ITEMS, commit_discover, discover_plan, discover_seed_youtube_ids, refresh, shelves,
    smart_mixes,
};
pub use signals::{DEFAULT_SOURCE, mark_not_interested, undo_not_interested};
pub use similar::similar_tracks;
pub use stats::{library_stats, mix_tracks};
