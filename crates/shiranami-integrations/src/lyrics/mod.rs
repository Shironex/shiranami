//! Lyrics resolution: three sources, one precedence ladder.
//!
//! Ported from `apps/desktop/src/main/services/{lyrics-parse,local-lyrics,
//! embedded-lyrics,lyrics-service}.ts`. The sources, in the order the ladder
//! considers them:
//!
//! 1. [`local`] — a sidecar `.lrc`/`.txt` beside the track (v0.24's
//!    "local-first lyrics").
//! 2. [`embedded`] — `SYLT`/`USLT`/Vorbis/MP4 lyric tags inside the file.
//! 3. [`lrclib`] — the LRCLIB directory, over the gated HTTP client.
//!
//! [`service`] owns the ladder itself and is the only module a caller needs.
//!
//! # …and one way back down it
//!
//! [`writeback`] closes the loop the three sources left open: a synced LRCLIB
//! hit is written to a `.lrc` beside the track, so the *next* play is answered
//! by source 1 with no network at all. That is the whole design — there is no
//! second read path, because the sidecar reader is already the top of the
//! ladder. [`batch`] runs the same write over a whole library.
//!
//! Both are **off by default** and refuse at the trait level: see
//! [`LyricsPolicy::should_save_fetched_lyrics`].
#![warn(missing_docs)]

pub mod batch;
pub mod cache;
pub mod embedded;
pub mod error;
pub mod local;
pub mod lrclib;
pub mod parse;
pub mod query;
pub mod service;
pub mod writeback;

pub use batch::{
    LyricsBatchProgress, LyricsBatchStatus, LyricsBatchSummary, LyricsBatchTrack,
    save_lyrics_for_tracks,
};
pub use error::{LookupFailure, LyricsError, Result};
pub use lrclib::{LrclibClient, LrclibLyrics, LrclibOutcome, LrclibQuery};
pub use parse::{has_plain_lyrics, has_synced_lyrics, parse_lrc};
pub use query::build_search_queries;
pub use service::{LyricsPolicy, LyricsRequest, LyricsService, SaveOutcome};
pub use writeback::{SidecarOutcome, SidecarSkip};
