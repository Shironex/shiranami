//! SQLite ownership: the pool, the migration ledger, and every query.
//!
//! `shiranami-db` owns the `sqlx` pool configuration (WAL, `foreign_keys=ON`,
//! `quick_check`), the migration set including the idempotent `0001_baseline`
//! squash and the one-shot drizzle-to-sqlx ledger adoption, the
//! `PRAGMA user_version` compatibility floor with its downgrade guard, the
//! legacy-baseline and disc-number heal branches, the repositories behind the
//! 45 database IPC channels (tracks, history, folders, playlists, smart
//! playlists with their rule-to-SQL compiler), and backup/export/import. SQL
//! never leaves this crate.
//!
//! Ported in Phases 6 and 7, gated on the `sqlite_master` diff test. See
//! `docs/v2/architecture.md` §3.2.
//!
//! # Phase 6: the handover
//!
//! The load-bearing fact about this crate is that its input is *a real user's
//! file*, written by an Electron app across two dozen releases, and that the
//! user can still go back to that app for the length of the handover window.
//! Three things follow, and every module here is shaped by them:
//!
//! - **The squash must equal the chain.** [`migrations`] stamps
//!   `0001_baseline.sql` as applied without running it, so if that file and
//!   v1's nine drizzle migrations ever describe different schemas, v2 queries a
//!   schema nobody checked. `tests/schema_equivalence.rs` is what makes that a
//!   caught mistake rather than a shipped one.
//! - **Uncertainty is fatal, not recoverable.** [`adopt`] refuses a damaged
//!   file, a file stamped by a newer build, or a ledger naming a migration this
//!   build has never heard of. Refusing leaves the user's data intact; guessing
//!   does not (architecture §3.1 step 7).
//! - **The door stays open both ways.** [`compat`] freezes the `user_version`
//!   floor, adoption leaves `__drizzle_migrations` in place, and a fresh v2
//!   install writes one — so a v1 build can still read what v2 has touched.

pub mod error;
pub mod pool;

pub use error::{DbError, Result};
