//! The repositories behind the `db:*` IPC channels.
//!
//! One module per channel namespace, each holding the SQL for exactly the
//! handlers v1 registered for it. The queries are ports, not redesigns: sort
//! order, tie-breaks, chunk sizes, transaction boundaries, idempotency
//! behaviour and returned shapes all match `apps/desktop/src/main/ipc/database/`
//! statement for statement, because the renderer that consumes them is
//! unchanged (architecture §2.6) and a "tidier" query here is a silent
//! behaviour change there.
//!
//! # The single connection, and the one calling convention
//!
//! [`crate::pool`] holds exactly one connection, so the cardinal rule of this
//! module is that **no repository call may acquire a connection while one is
//! already held** — with a single-connection pool a nested `pool.acquire()`
//! does not merely contend, it deadlocks against itself.
//!
//! The convention that makes the rule checkable by signature rather than by
//! review: **every repository function takes `&mut SqliteConnection` and none
//! of them acquires**. The command layer acquires once at its boundary (via
//! [`conn::acquire`], the only acquire site in the crate), passes `&mut *conn`
//! down through every repository call the command needs, and drops it on
//! return. Multi-statement work takes a `Transaction` from that same
//! connection and passes `&mut *tx` down — the same borrow discipline one
//! level in. Repository functions never call each other; shared logic is a
//! private helper over `&mut SqliteConnection` that cannot acquire anything.
//!
//! # Ambient inputs
//!
//! Row identifiers arrive from [`ids`]; "now" timestamps come from SQLite's
//! own clock inside the SQL (`strftime`) where v1's format is load-bearing,
//! or as parameters where a caller-supplied instant is part of the contract.
//! [`history::record_play`] and [`radio::add`] deliberately disagree about
//! the timestamp format — "tidying" that up would silently corrupt a sort
//! order.

// lane A — library side (tracks, folders, playlists, smart playlists)
pub(crate) mod clock;
pub(crate) mod conn;
pub mod folders;
pub(crate) mod ids;
pub mod playlist_tracks;
pub mod playlists;
pub mod smart_playlists;
pub mod smart_rules;
pub(crate) mod track_patch;
pub(crate) mod track_row;
pub mod tracks;

// lane B — activity side (play history, download queue, radio, backup)
pub mod backup;
pub mod download_queue;
pub mod history;
pub mod radio;

// Phase 12 lane B — the scrobble retry queue, which has no v1 table: v1 parked
// failed submissions in a process-memory array. Migration `0002` adds it.
pub mod scrobble_queue;

// Phase 14 — the v1 tables with no `db:*` channel of their own. Share-payload
// assembly, RD-mix discovery and shelf scoring read them inline in v1; all
// three are jobs for a layer above in v2, and none can be written without these
// queries.
pub mod recommendations;
pub mod youtube_mappings;
