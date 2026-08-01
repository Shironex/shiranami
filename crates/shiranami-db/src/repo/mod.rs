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
//! # The single connection
//!
//! [`crate::pool`] holds exactly one connection, so the cardinal rule of this
//! module is that **no repository call may acquire a second connection while
//! holding one**. Every public function follows the same shape — acquire once
//! at the top, do all of its work (including any transaction) on that one
//! connection, drop it on return — which is what makes the rule checkable by
//! reading a single function rather than a call graph. [`conn::acquire`] is the
//! only place a connection is taken.
//!
//! Repository functions therefore never call each other. Where two channels
//! share logic, the shared part is a private helper over `&mut SqliteConnection`
//! that cannot acquire anything.

// lane A — library side (tracks, folders, playlists, smart playlists)
pub(crate) mod clock;
pub(crate) mod conn;
pub mod folders;
pub mod playlist_tracks;
pub mod playlists;
pub mod smart_playlists;
pub mod smart_rules;
pub(crate) mod track_patch;
pub(crate) mod track_row;
pub mod tracks;
