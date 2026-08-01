//! The repositories behind the database IPC channels.
//!
//! One module per entity, each a set of free functions over a borrowed
//! connection. Nothing here opens, migrates, or adopts a database — that is
//! [`crate::database::open`]'s job, and by the time a repository runs, the file
//! is known-good.
//!
//! # Every function borrows a connection; none of them acquires one
//!
//! This is the load-bearing rule of the whole module, and it is enforced by the
//! signatures rather than by review: a function that takes `&mut
//! SqliteConnection` *cannot* reach the pool, so it cannot acquire a second
//! connection while the caller holds the first.
//!
//! The reason is [`crate::pool`]'s single connection. v1 ran every database
//! channel through one synchronous better-sqlite3 handle, and v2 keeps that
//! shape because it removes the `SQLITE_BUSY_SNAPSHOT` class outright — sqlx
//! opens *deferred* transactions, so two concurrent writers that each read
//! before writing race to upgrade, and `busy_timeout` explicitly does not retry
//! the loser. With one connection there is no race to lose.
//!
//! The corollary is that a nested `pool.acquire()` does not merely contend, it
//! **deadlocks against itself**: the pool has nothing left to hand out and the
//! holder is blocked waiting for it. So the calling convention is fixed —
//! acquire once at the command boundary, pass `&mut *conn` down through every
//! repository call the command needs, drop it when the command returns:
//!
//! ```ignore
//! let mut conn = pool.acquire().await?;
//! let entry = repo::history::record_play(&mut conn, /* … */).await?;
//! let recent = repo::history::recent(&mut conn, /* … */).await?;
//! drop(conn);
//! ```
//!
//! Multi-statement work takes a `Transaction` from that same connection and
//! passes `&mut *tx` down, which is the same borrow discipline one level in.
//!
//! # Ambient inputs are parameters, not calls
//!
//! Row identifiers and "now" timestamps arrive as arguments rather than being
//! minted here. v1 called `crypto.randomUUID()` and `new Date().toISOString()`
//! inline in its handlers; v2 cannot, because neither a UUID crate nor a clock
//! crate is in the workspace's pinned dependency set (architecture Appendix B),
//! and adding one to reach for it inside a query layer would be the wrong trade.
//! Passing them in is better anyway: the queries stay pure, so a test can assert
//! an exact row instead of a shape, and the command layer keeps one obvious
//! place where identity and time enter the system.
//!
//! The timestamp *format* is not a free choice, though — see
//! [`history::record_play`] and [`radio::add`], which disagree about it for a
//! reason that would silently corrupt a sort order if it were "tidied up".

// lane B — activity-side repositories (play history, download queue, radio,
// backup). Lane A appends the library-side modules in its own group.
pub mod download_queue;
pub mod history;
