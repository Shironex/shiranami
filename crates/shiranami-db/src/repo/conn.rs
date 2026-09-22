//! Taking the one connection, and naming what went wrong on it.
//!
//! Small on purpose. Its whole job is to be the single place a repository
//! reaches into the pool, so that "does anything acquire twice?" is answered by
//! grepping for [`acquire`] rather than by reading every query in the crate.
//!
//! Shared by both Phase 7 lanes; neither owns it.

use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqlitePool};

use crate::error::{DbError, Result};

/// Take the pool's connection for the duration of one repository call.
///
/// The pool is configured with `max_connections = 1`, so this waits when the
/// connection is already out and *deadlocks* if the same task is already
/// holding it. That is the intended failure mode: it turns "two connections at
/// once" from a subtle `SQLITE_BUSY_SNAPSHOT` under load into an obvious hang
/// on the first test run (see [`crate::pool`] for why the count is one).
pub(crate) async fn acquire(pool: &SqlitePool) -> Result<PoolConnection<Sqlite>> {
    pool.acquire().await.map_err(|source| DbError::Query {
        operation: "acquire the database connection",
        source,
    })
}

/// Name a failed query, for `.map_err(failed("read the library"))`.
///
/// `operation` is a verb phrase completing "could not …", so the rendered error
/// reads as a sentence — the same convention [`DbError::Query`] documents.
pub(crate) fn failed(operation: &'static str) -> impl FnOnce(sqlx::Error) -> DbError {
    move |source| DbError::Query { operation, source }
}
