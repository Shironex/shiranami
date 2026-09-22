//! Recommendation scoring, split into a pure half and an I/O half.
//!
//! `core` holds the affinity, similarity and mix-scoring functions ported
//! verbatim from `@shiranami/recommendation` — no I/O, fully unit-tested
//! against the same fixtures, which is what makes it the warm-up port. `service`
//! holds the SQL aggregation over `play_history` that feeds it, the shelf
//! assembly, and the yt-dlp radio-mix discovery path that deliberately avoids
//! the YouTube Data API.
//!
//! `core` was ported in Phase 4; `service` landed in Phase 14 with the six
//! `recommendations:*` commands that consume it, once the repositories it reads
//! existed. See `docs/v2/architecture.md` §2.2 (#24, #37).

// The scoring functions and their knobs are the whole public surface of this
// crate, and the numbers they produce are a user-visible contract. An
// undocumented one is a contract nobody can read, so the crate gates on it.
#![warn(missing_docs)]

pub mod core;
pub mod service;
