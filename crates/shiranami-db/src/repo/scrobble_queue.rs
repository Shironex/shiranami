//! The persisted scrobble retry queue.
//!
//! Ported from `apps/desktop/src/main/scrobble/scrobble-queue.ts`, which was a
//! **pure state machine over a process-memory array**: the service enqueued on
//! a failed submission, asked for due items on a timer tick, and called
//! `markRetried` or `remove` with the result. Everything about that survives —
//! the backoff curve, the attempt ceiling, the size cap, the eviction order —
//! and the array becomes a table (architecture §2.2, subsystem 25: *"persist
//! the retry queue (today it's memory-only)"*).
//!
//! The state machine lives here, with the table, rather than in
//! `shiranami-integrations`, for the same reason it lived in its own module in
//! v1: the decision "retry later or drop" and the storage it mutates are one
//! thing. Splitting them would put the invariant in two places and turn
//! [`mark_retried`] into a read-modify-write over the single-connection pool.
//! The service shell — timers, HTTP, settings — stays in `integrations`.
//!
//! # What persistence changes, and what it deliberately does not
//!
//! The upgrade is durability: a play that failed to submit now survives a quit.
//! Nothing else moves. In particular the discard rules are v1's, verbatim:
//!
//! * a submission failure is a submission failure — v1 never classified them,
//!   so neither does this. A 400 from Last.fm retries exactly like a timeout.
//!   Errors that are genuinely permanent are discarded by the attempt ceiling
//!   like everything else, a few hours later.
//! * [`MAX_ATTEMPTS`] failed retries drop the row.
//! * a retry that leaves no backend owing the scrobble drops the row. The
//!   schema's CHECK makes that state unstorable rather than merely unwritten.
//! * past [`MAX_QUEUE_SIZE`] rows the oldest are evicted, so a long offline
//!   stretch cannot grow the table without bound.
//!
//! One thing does change, and it fixes a latent v1 bug. v1's `enqueue` appended
//! unconditionally, so re-parking a play the queue already held — same artist,
//! same track, same start second, hence the same content-derived id — put two
//! copies in the array and submitted it twice on the next flush. `id` is the
//! primary key here, so a re-enqueue updates in place.
//!
//! # Types live here, not in `shiranami-core`
//!
//! [`QueuedScrobble`] never crosses the IPC boundary — the renderer sees only
//! `pendingCount` on `ScrobbleStatus` — so it is not a wire model and does not
//! belong in `core::models`, whose contract is that everything in it *is* one.
//! It is a row, and the module that owns the table owns it.

use sqlx::SqliteConnection;

use crate::error::{DbError, Result};

/// Base backoff; doubles per attempt, capped at [`MAX_BACKOFF_MS`].
const BASE_BACKOFF_MS: i64 = 60_000;

/// Ceiling on the backoff delay: one hour.
const MAX_BACKOFF_MS: i64 = 60 * 60 * 1_000;

/// Drop a scrobble after this many failed attempts.
///
/// v1's constant, and its reasoning: a play that cannot land inside the whole
/// backoff curve is not worth unbounded retention. (v1's comment said "~17h";
/// the curve it actually produces is about five hours. The number is ported,
/// not the arithmetic in the comment.)
pub const MAX_ATTEMPTS: u32 = 10;

/// Cap on parked rows, so a long offline stretch cannot grow without bound.
pub const MAX_QUEUE_SIZE: usize = 500;

/// Which backends still owe a scrobble.
///
/// A set of the two possible targets rather than a list, so that "owes nobody"
/// is one testable state instead of an empty collection that every caller has
/// to remember to check.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ScrobbleTargets {
    /// Last.fm still owes this scrobble.
    pub lastfm: bool,
    /// ListenBrainz still owes this scrobble.
    pub listenbrainz: bool,
}

impl ScrobbleTargets {
    /// A set naming neither backend.
    pub const NONE: Self = Self {
        lastfm: false,
        listenbrainz: false,
    };

    /// A set naming only Last.fm.
    pub const LASTFM: Self = Self {
        lastfm: true,
        listenbrainz: false,
    };

    /// A set naming only ListenBrainz.
    pub const LISTENBRAINZ: Self = Self {
        lastfm: false,
        listenbrainz: true,
    };

    /// A set naming both backends.
    pub const BOTH: Self = Self {
        lastfm: true,
        listenbrainz: true,
    };

    /// Whether no backend owes the scrobble — the drop condition.
    pub fn is_empty(self) -> bool {
        !self.lastfm && !self.listenbrainz
    }
}

/// A parked scrobble awaiting retry.
#[derive(Debug, Clone, PartialEq)]
pub struct QueuedScrobble {
    /// Stable id correlating a submit result back to the row.
    ///
    /// Derived from the play's content by the caller, which is what makes
    /// re-parking the same play an update rather than a duplicate.
    pub id: String,
    /// Track artist, as submitted.
    pub artist: String,
    /// Track title, as submitted.
    pub track: String,
    /// Album, when the play had one.
    pub album: Option<String>,
    /// Track length in seconds, when known.
    pub duration_seconds: Option<i64>,
    /// Unix **seconds** at which playback started.
    ///
    /// Preserved across retries so a scrobble that lands tomorrow still records
    /// the time the track was actually played.
    pub started_at: i64,
    /// Which backends still owe this scrobble.
    pub targets: ScrobbleTargets,
    /// How many submit attempts have been made; drives the backoff.
    pub attempts: u32,
    /// Earliest unix **milliseconds** at which the next attempt may run.
    pub next_attempt_at: i64,
    /// Unix **milliseconds** at which the row was first parked; orders eviction.
    pub enqueued_at: i64,
}

/// The backoff delay before attempt `attempts`: 1m, 2m, 4m … capped at an hour.
///
/// Ported including its call convention, which is where the curve users actually
/// see comes from. [`mark_retried`] passes the *incremented* count, so the first
/// retry after a failure waits two minutes, not one; the enqueue path sets
/// `next_attempt_at` to now and does not consult this at all.
pub fn backoff_ms(attempts: u32) -> i64 {
    let shift = attempts.min(u32::BITS - 1);
    let delay = BASE_BACKOFF_MS.saturating_mul(1_i64 << shift);
    delay.min(MAX_BACKOFF_MS)
}

/// Every parked scrobble, oldest play first.
///
/// The replay order, and the same order [`due`] returns, so a flush that
/// processes everything sees plays in the sequence they were listened to.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn load(conn: &mut SqliteConnection) -> Result<Vec<QueuedScrobble>> {
    let rows = sqlx::query_as::<_, QueueRow>(
        "SELECT id, artist, track, album, duration_seconds, started_at, \
                lastfm_pending, listenbrainz_pending, attempts, next_attempt_at, enqueued_at \
           FROM scrobble_queue \
          ORDER BY started_at ASC",
    )
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "load the parked scrobbles",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Park a failed scrobble, evicting the oldest rows past [`MAX_QUEUE_SIZE`].
///
/// Re-parking an id the table already holds updates it in place; see the module
/// docs for the v1 duplicate-submission bug that closes.
///
/// # Errors
///
/// Returns [`DbError::Query`] if either statement fails.
pub async fn enqueue(conn: &mut SqliteConnection, item: &QueuedScrobble) -> Result<()> {
    sqlx::query(
        "INSERT INTO scrobble_queue \
           (id, artist, track, album, duration_seconds, started_at, \
            lastfm_pending, listenbrainz_pending, attempts, next_attempt_at, enqueued_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
         ON CONFLICT(id) DO UPDATE SET \
            artist = excluded.artist, \
            track = excluded.track, \
            album = excluded.album, \
            duration_seconds = excluded.duration_seconds, \
            started_at = excluded.started_at, \
            lastfm_pending = excluded.lastfm_pending, \
            listenbrainz_pending = excluded.listenbrainz_pending, \
            attempts = excluded.attempts, \
            next_attempt_at = excluded.next_attempt_at",
    )
    .bind(&item.id)
    .bind(&item.artist)
    .bind(&item.track)
    .bind(item.album.as_deref())
    .bind(item.duration_seconds)
    .bind(item.started_at)
    .bind(item.targets.lastfm)
    .bind(item.targets.listenbrainz)
    .bind(item.attempts)
    .bind(item.next_attempt_at)
    .bind(item.enqueued_at)
    .execute(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "park a failed scrobble",
        source,
    })?;

    // `enqueued_at` is deliberately left alone by the conflict branch: a
    // re-parked play keeps its original position in the eviction order rather
    // than jumping to the back of the queue on every retry.
    evict_overflow(conn).await
}

/// The parked scrobbles due at `now_ms`, oldest play first.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn due(conn: &mut SqliteConnection, now_ms: i64) -> Result<Vec<QueuedScrobble>> {
    let rows = sqlx::query_as::<_, QueueRow>(
        "SELECT id, artist, track, album, duration_seconds, started_at, \
                lastfm_pending, listenbrainz_pending, attempts, next_attempt_at, enqueued_at \
           FROM scrobble_queue \
          WHERE next_attempt_at <= ?1 \
          ORDER BY started_at ASC",
    )
    .bind(now_ms)
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "read the due scrobbles",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Record a failed retry: reschedule with backoff, or drop the row.
///
/// Returns whether the row survived. It is dropped when `remaining` names no
/// backend, or when the incremented attempt count reaches [`MAX_ATTEMPTS`] —
/// v1's two conditions, in v1's order.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn mark_retried(
    conn: &mut SqliteConnection,
    id: &str,
    remaining: ScrobbleTargets,
    now_ms: i64,
) -> Result<bool> {
    let Some(attempts) = attempts_of(&mut *conn, id).await? else {
        // Already gone — evicted, or dropped by a previous flush. v1's
        // `flatMap` over a missing id was a no-op too.
        return Ok(false);
    };

    let attempts = attempts.saturating_add(1);
    if remaining.is_empty() || attempts >= MAX_ATTEMPTS {
        remove(conn, id).await?;
        return Ok(false);
    }

    sqlx::query(
        "UPDATE scrobble_queue \
            SET lastfm_pending = ?2, listenbrainz_pending = ?3, \
                attempts = ?4, next_attempt_at = ?5 \
          WHERE id = ?1",
    )
    .bind(id)
    .bind(remaining.lastfm)
    .bind(remaining.listenbrainz)
    .bind(attempts)
    .bind(now_ms.saturating_add(backoff_ms(attempts)))
    .execute(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "reschedule a parked scrobble",
        source,
    })?;

    Ok(true)
}

/// Drop one parked scrobble, whether it landed or gave up.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn remove(conn: &mut SqliteConnection, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM scrobble_queue WHERE id = ?1")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "drop a parked scrobble",
            source,
        })?;

    Ok(())
}

/// How many scrobbles are parked — the `pendingCount` the Settings UI shows.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn count(conn: &mut SqliteConnection) -> Result<u32> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM scrobble_queue")
        .fetch_one(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "count the parked scrobbles",
            source,
        })?;

    Ok(count.clamp(0, i64::from(u32::MAX)) as u32)
}

/// Drop every parked scrobble.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn clear(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query("DELETE FROM scrobble_queue")
        .execute(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "clear the parked scrobbles",
            source,
        })?;

    Ok(())
}

/// The current attempt count for `id`, or `None` when the row is gone.
async fn attempts_of(conn: &mut SqliteConnection, id: &str) -> Result<Option<u32>> {
    let row: Option<(u32,)> = sqlx::query_as("SELECT attempts FROM scrobble_queue WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "read a parked scrobble's attempt count",
            source,
        })?;

    Ok(row.map(|(attempts,)| attempts))
}

/// Evict the oldest rows until at most [`MAX_QUEUE_SIZE`] remain.
///
/// v1 spliced the front of the array; `enqueued_at` is the column that stands in
/// for array position, with `id` breaking ties so the eviction is deterministic
/// when two plays are parked in the same millisecond.
async fn evict_overflow(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query(
        "DELETE FROM scrobble_queue \
          WHERE id IN ( \
                SELECT id FROM scrobble_queue \
                 ORDER BY enqueued_at DESC, id DESC \
                 LIMIT -1 OFFSET ?1 \
          )",
    )
    .bind(i64::try_from(MAX_QUEUE_SIZE).unwrap_or(i64::MAX))
    .execute(&mut *conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "evict the oldest parked scrobbles",
        source,
    })?;

    Ok(())
}

#[derive(sqlx::FromRow)]
struct QueueRow {
    id: String,
    artist: String,
    track: String,
    album: Option<String>,
    duration_seconds: Option<i64>,
    started_at: i64,
    lastfm_pending: bool,
    listenbrainz_pending: bool,
    attempts: u32,
    next_attempt_at: i64,
    enqueued_at: i64,
}

impl From<QueueRow> for QueuedScrobble {
    fn from(row: QueueRow) -> Self {
        Self {
            id: row.id,
            artist: row.artist,
            track: row.track,
            album: row.album,
            duration_seconds: row.duration_seconds,
            started_at: row.started_at,
            targets: ScrobbleTargets {
                lastfm: row.lastfm_pending,
                listenbrainz: row.listenbrainz_pending,
            },
            attempts: row.attempts,
            next_attempt_at: row.next_attempt_at,
            enqueued_at: row.enqueued_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v1's curve, including the doubling and the one-hour ceiling. These are
    /// the delays a user waits through, so they are pinned as values rather
    /// than re-derived from the formula the code already contains.
    #[test]
    fn the_backoff_doubles_and_then_flattens_at_an_hour() {
        assert_eq!(backoff_ms(0), 60_000);
        assert_eq!(backoff_ms(1), 120_000);
        assert_eq!(backoff_ms(2), 240_000);
        assert_eq!(backoff_ms(3), 480_000);
        assert_eq!(backoff_ms(4), 960_000);
        assert_eq!(backoff_ms(5), 1_920_000);
        assert_eq!(backoff_ms(6), MAX_BACKOFF_MS);
        assert_eq!(backoff_ms(9), MAX_BACKOFF_MS);
    }

    /// The shift is clamped, so an absurd attempt count saturates at the cap
    /// instead of overflowing. Unreachable through [`mark_retried`], which drops
    /// the row at [`MAX_ATTEMPTS`], but the function is public.
    #[test]
    fn an_absurd_attempt_count_still_returns_the_cap() {
        assert_eq!(backoff_ms(u32::MAX), MAX_BACKOFF_MS);
    }

    #[test]
    fn an_empty_target_set_is_the_drop_condition() {
        assert!(ScrobbleTargets::NONE.is_empty());
        assert!(!ScrobbleTargets::LASTFM.is_empty());
        assert!(!ScrobbleTargets::LISTENBRAINZ.is_empty());
        assert!(!ScrobbleTargets::BOTH.is_empty());
    }
}
