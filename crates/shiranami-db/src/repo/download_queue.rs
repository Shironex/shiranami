//! Write-through persistence for the download queue.
//!
//! Ported from `apps/desktop/src/main/downloads/download-queue-persistence.ts`.
//! The queue itself is an in-memory manager (Phase 11); this is only the table
//! behind it, so that a queue survives a restart.
//!
//! # What the table is for, and what it deliberately cannot do
//!
//! Only *recoverable* items are worth a row. A `queued` item can be resumed by
//! re-downloading it; a `done` item names a file that was written but not yet
//! imported, which the next launch can still import. An `error` or `canceled`
//! item carries no recovery action, so the queue deletes its row instead of
//! updating it — which is why nothing here filters by status on the way in:
//! [`upsert`] persists whatever it is handed, and the *caller* decides what is
//! worth handing it.
//!
//! Two columns are missing on purpose. `progress` is transient — there is no
//! mid-download resume protocol, so a restart begins the transfer again from
//! zero and any persisted percentage would be a lie. `error` is missing because
//! error rows are never persisted at all.
//!
//! [`load`] therefore rewrites two fields as it reads: anything not `done` comes
//! back as `queued` (`active` and `converting` were interrupted mid-flight and
//! have to start over), and progress is synthesised as 100 for `done`, 0
//! otherwise.
//!
//! # Errors are returned, not swallowed
//!
//! v1's persistence layer logged and swallowed every failure, so that a
//! database hiccup could never take down a download that was otherwise working.
//! That policy is right, and it stays with the queue in Phase 11 rather than
//! here: a repository that silently returns an empty `Vec` cannot be
//! distinguished from an empty queue by the one caller that might care.
//!
//! The paused flag v1 kept alongside these methods is **not** here. It lived in
//! `electron-store` under `downloads.queuePaused`, not in SQLite, and belongs to
//! [`shiranami_core::store`].

use shiranami_core::models::{DownloadQueueItem, DownloadQueueStatus};
use sqlx::SqliteConnection;

use crate::error::{DbError, Result};

/// How many ids go into one `DELETE … IN (…)`.
///
/// SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` is 32766, so 500 is far from
/// the limit; it matches the chunk size the v1 playlist handlers already used
/// for the same job, which is the number to be consistent with rather than the
/// largest one that happens to work.
const DELETE_CHUNK: usize = 500;

/// Every persisted item, in enqueue order.
///
/// Statuses and progress are normalised for resume — see the module docs.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the query fails.
pub async fn load(conn: &mut SqliteConnection) -> Result<Vec<DownloadQueueItem>> {
    let rows = sqlx::query_as::<_, QueueRow>(
        "SELECT id, url, youtube_id, title, thumbnail, status, file_path, \
                batch_id, batch_index, batch_source_title, batch_create_playlist, \
                enqueued_at, started_at, finished_at \
           FROM download_queue \
          ORDER BY enqueued_at ASC",
    )
    .fetch_all(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "load the persisted download queue",
        source,
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Insert or replace one item by id.
///
/// The queue calls this on enqueue and again when an item reaches `done`, so
/// the conflict path is the common one, not the exception.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn upsert(conn: &mut SqliteConnection, item: &DownloadQueueItem) -> Result<()> {
    sqlx::query(
        "INSERT INTO download_queue \
           (id, url, youtube_id, title, thumbnail, status, file_path, \
            batch_id, batch_index, batch_source_title, batch_create_playlist, \
            enqueued_at, started_at, finished_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
         ON CONFLICT(id) DO UPDATE SET \
            url = excluded.url, \
            youtube_id = excluded.youtube_id, \
            title = excluded.title, \
            thumbnail = excluded.thumbnail, \
            status = excluded.status, \
            file_path = excluded.file_path, \
            batch_id = excluded.batch_id, \
            batch_index = excluded.batch_index, \
            batch_source_title = excluded.batch_source_title, \
            batch_create_playlist = excluded.batch_create_playlist, \
            enqueued_at = excluded.enqueued_at, \
            started_at = excluded.started_at, \
            finished_at = excluded.finished_at",
    )
    .bind(&item.id)
    .bind(&item.url)
    .bind(item.youtube_id.as_deref())
    .bind(&item.title)
    .bind(item.thumbnail.as_deref())
    .bind(status_to_column(item.status))
    .bind(item.file_path.as_deref())
    .bind(item.batch_id.as_deref())
    .bind(item.batch_index)
    .bind(item.batch_source_title.as_deref())
    .bind(item.batch_create_playlist)
    .bind(item.enqueued_at)
    .bind(item.started_at)
    .bind(item.finished_at)
    .execute(conn)
    .await
    .map_err(|source| DbError::Query {
        operation: "persist the download queue item",
        source,
    })?;

    Ok(())
}

/// Remove one persisted item.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn remove(conn: &mut SqliteConnection, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM download_queue WHERE id = ?1")
        .bind(id)
        .execute(conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "remove the persisted download queue item",
            source,
        })?;

    Ok(())
}

/// Remove several persisted items, in chunks of [`DELETE_CHUNK`].
///
/// A no-op for an empty slice — `DELETE … IN ()` is not valid SQL.
///
/// # Errors
///
/// Returns [`DbError::Query`] if any chunk fails. Earlier chunks have already
/// committed at that point; the caller is deleting rows whose only purpose is
/// resume, so a partial delete costs a redundant row, not correctness.
pub async fn remove_many(conn: &mut SqliteConnection, ids: &[String]) -> Result<()> {
    for batch in ids.chunks(DELETE_CHUNK) {
        // The only statement in this module whose text is not fixed. What
        // varies is the number of `?` placeholders and nothing else: the
        // fragment is built from `batch.len()`, every id is bound, and no
        // caller value reaches the string. That is the audit `AssertSqlSafe`
        // asks for (sqlx 0.9, as in `compat::stamp_user_version`).
        let placeholders = std::iter::repeat_n("?", batch.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("DELETE FROM download_queue WHERE id IN ({placeholders})");

        let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
        for id in batch {
            query = query.bind(id);
        }

        query
            .execute(&mut *conn)
            .await
            .map_err(|source| DbError::Query {
                operation: "remove the persisted download queue items",
                source,
            })?;
    }

    Ok(())
}

/// Remove every persisted item.
///
/// # Errors
///
/// Returns [`DbError::Query`] if the statement fails.
pub async fn clear(conn: &mut SqliteConnection) -> Result<()> {
    sqlx::query("DELETE FROM download_queue")
        .execute(conn)
        .await
        .map_err(|source| DbError::Query {
            operation: "clear the persisted download queue",
            source,
        })?;

    Ok(())
}

/// The status text as the column stores it.
///
/// Spelled out rather than derived from the serde representation: the column is
/// a persisted format shared with v1, and it should not follow a rename made
/// for the wire.
fn status_to_column(status: DownloadQueueStatus) -> &'static str {
    match status {
        DownloadQueueStatus::Queued => "queued",
        DownloadQueueStatus::Active => "active",
        DownloadQueueStatus::Converting => "converting",
        DownloadQueueStatus::Done => "done",
        DownloadQueueStatus::Error => "error",
        DownloadQueueStatus::Canceled => "canceled",
    }
}

/// Progress reported for a restored item: complete, or not started.
const PROGRESS_DONE: f64 = 100.0;
const PROGRESS_NONE: f64 = 0.0;

#[derive(sqlx::FromRow)]
struct QueueRow {
    id: String,
    url: String,
    youtube_id: Option<String>,
    title: String,
    thumbnail: Option<String>,
    status: String,
    file_path: Option<String>,
    batch_id: Option<String>,
    batch_index: Option<u32>,
    batch_source_title: Option<String>,
    batch_create_playlist: Option<bool>,
    enqueued_at: i64,
    started_at: Option<i64>,
    finished_at: Option<i64>,
}

impl From<QueueRow> for DownloadQueueItem {
    fn from(row: QueueRow) -> Self {
        // Anything that is not exactly `done` restores as `queued`, including a
        // status this build does not recognise. That is v1's `row.status ===
        // 'done' ? 'done' : 'queued'`, and it is the safe direction: a
        // mis-restored item re-downloads, where the alternative is a phantom
        // `done` row pointing at a file that was never written.
        let status = if row.status == "done" {
            DownloadQueueStatus::Done
        } else {
            DownloadQueueStatus::Queued
        };

        Self {
            id: row.id,
            url: row.url,
            youtube_id: row.youtube_id,
            title: row.title,
            thumbnail: row.thumbnail,
            status,
            progress: if status == DownloadQueueStatus::Done {
                PROGRESS_DONE
            } else {
                PROGRESS_NONE
            },
            file_path: row.file_path,
            error: None,
            batch_id: row.batch_id,
            batch_index: row.batch_index,
            batch_source_title: row.batch_source_title,
            batch_create_playlist: row.batch_create_playlist,
            enqueued_at: row.enqueued_at,
            started_at: row.started_at,
            finished_at: row.finished_at,
        }
    }
}
