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
#![warn(missing_docs)]

pub mod cache;
pub mod embedded;
pub mod error;
pub mod local;
pub mod lrclib;
pub mod parse;
pub mod query;
pub mod service;

pub use error::{LookupFailure, LyricsError, Result};
pub use lrclib::{LrclibClient, LrclibOutcome, LrclibQuery};
pub use parse::{has_plain_lyrics, has_synced_lyrics, parse_lrc};
pub use query::build_search_queries;
pub use service::{LyricsPolicy, LyricsRequest, LyricsService};
