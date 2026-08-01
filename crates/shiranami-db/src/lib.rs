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
