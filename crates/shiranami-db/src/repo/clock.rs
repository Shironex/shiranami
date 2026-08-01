//! The two timestamp spellings already on disk.
//!
//! v1 wrote timestamps two different ways into the same database, and both
//! shapes exist in every shipped library, so neither can be tidied without
//! rewriting user rows:
//!
//! | Written by                              | Example                    |
//! | --------------------------------------- | -------------------------- |
//! | a column `DEFAULT (datetime('now'))`    | `2026-08-01 12:34:56`      |
//! | a handler calling `new Date().toISOString()` | `2026-08-01T12:34:56.789Z` |
//!
//! Which one a column holds depends on which code path last touched the row —
//! `folders.last_scanned` and `playlists.updated_at` are handler-written, while
//! `smart_playlists.updated_at` is `datetime('now')` even on update, because
//! that handler passed a raw SQL expression instead of a JavaScript date.
//!
//! Both constants are SQL expressions, not values, and are only ever
//! concatenated with other literals.
//!
//! Shared by both Phase 7 lanes; neither owns it.

/// SQLite's spelling of JavaScript's `new Date().toISOString()`.
///
/// `%f` renders seconds with three decimals, so this produces
/// `2026-08-01T12:34:56.789Z` — same 24 characters, same `T` separator, same
/// millisecond precision, same trailing `Z` as the strings v1's handlers wrote.
/// The clock moves from the Node process to SQLite, which is the same system
/// UTC clock the column defaults already read.
pub(crate) const ISO_8601_NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/// What a `DEFAULT (datetime('now'))` column writes: `2026-08-01 12:34:56`.
///
/// Second resolution, no `T`, no zone suffix. Used where a v1 handler set a
/// timestamp with drizzle's ``sql`datetime('now')` `` rather than a JavaScript
/// date — `smart_playlists.updated_at` is the one that does.
pub(crate) const SQLITE_NOW: &str = "datetime('now')";
