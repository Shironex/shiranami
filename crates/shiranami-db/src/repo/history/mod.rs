//! Play history: recording a play, and the five read shapes built on top of it.
//!
//! Ported from `apps/desktop/src/main/ipc/database/history.ts`. Six channels,
//! five of them aggregate SQL, and the aggregates are where the fidelity risk
//! lives — a `GROUP BY` moved one expression to the left changes what a user's
//! "top artists" card says without changing a type or failing a test that only
//! checks shapes. Each query is annotated where it looks arbitrary.
//!
//! Split along the seam the channels already have: [`record`] is the one write,
//! [`read`] is the five reads, and [`rows`] is where the nullable columns meet
//! the non-null wire fields.
//!
//! # Two things that must not be tidied
//!
//! **`played_at` is written in JavaScript's ISO format, not SQLite's.** The
//! column's `DEFAULT (datetime('now'))` produces `2026-08-01 12:34:56`, while
//! v1 always passed `new Date().toISOString()` — `2026-08-01T12:34:56.789Z`.
//! Every row in every shipped database therefore has the second form, and the
//! column is compared, ordered, and grouped as **text**. Letting a single row
//! fall back to the column default would sort it before every real row for the
//! next thousand years, because `' '` (0x20) sorts below `'T'` (0x54).
//! [`record_play`] takes the timestamp as an argument for exactly this reason
//! and never relies on the default.
//!
//! **The unknown-artist collapse happens after grouping, not before.** v1 read
//! the raw nullable column, grouped on it, and only then substituted
//! `UNKNOWN_ARTIST` for display. Folding a `COALESCE` into the `GROUP BY` would
//! merge untagged tracks with tracks genuinely tagged "Unknown Artist" — a
//! different answer, silently. The tests pin the distinction.
//!
//! # Windowing
//!
//! Every read takes an optional `since` (and the summary an optional exclusive
//! `until`). Rather than assembling SQL per combination, the filters are always
//! present as `?n IS NULL OR …`, so each query is one `&'static str` with
//! nothing interpolated. The aggregates scan the table regardless of the
//! window, so nothing is lost; [`recent`] still walks
//! `idx_play_history_played_at` in reverse for its `ORDER BY … LIMIT`.

mod read;
mod record;
mod rows;

pub use read::{activity, hourly_activity, recent, summary, weekly_insights};
pub use record::{PlayedTrackTags, RecordedPlay, record_play};
