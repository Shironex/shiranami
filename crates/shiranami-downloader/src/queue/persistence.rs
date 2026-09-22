//! Write-through persistence for the queue.
//!
//! Two stores, because v1 used two: the items live in the `download_queue`
//! table, and the paused flag lives in the settings document under
//! `downloads.queuePaused`. That split is not tidiness — `shiranami-db`'s
//! repository module says so explicitly — it is that the flag is a user
//! preference and the rows are recoverable work.
//!
//! # Failures are returned here and swallowed one level up
//!
//! Every method returns a `Result`. [`crate::queue::manager`] logs and
//! continues, which is v1's policy: a database hiccup must never take down a
//! download that is otherwise working, and the worst case is a queue that does
//! not survive the next restart. The policy lives in the manager rather than
//! here because a repository that silently returns an empty `Vec` cannot be
//! told apart from an empty queue by the one caller that might care.
//!
//! # Connections
//!
//! The pool holds a single connection (Phase 6 amendment), so each method
//! acquires it, uses it and drops it. Nothing here holds a connection across
//! an await that could reach another acquire, which is the rule that keeps the
//! single-connection pool from contending with the command layer.

use shiranami_core::models::DownloadQueueItem;
use shiranami_db::repo::download_queue;
use sqlx::SqlitePool;

use crate::error::{DownloaderError, Result};

/// Reads and writes the persisted paused flag.
///
/// A trait because the flag lives in the settings document, which Phase 14
/// owns: this crate must not reach into a store instance it did not create.
#[async_trait::async_trait]
pub trait PausedFlag: Send + Sync {
    /// The persisted flag, defaulting to `false`.
    async fn is_paused(&self) -> bool;
    /// Persist the flag.
    async fn set_paused(&self, paused: bool);
}

/// A flag that remembers nothing, for a queue running without persistence.
#[derive(Debug, Default)]
pub struct NoPausedFlag;

#[async_trait::async_trait]
impl PausedFlag for NoPausedFlag {
    async fn is_paused(&self) -> bool {
        false
    }

    async fn set_paused(&self, _paused: bool) {}
}

/// Everything the queue persists.
#[async_trait::async_trait]
pub trait QueuePersistence: Send + Sync {
    /// Every persisted item, in enqueue order, normalised for resume.
    async fn load(&self) -> Result<Vec<DownloadQueueItem>>;
    /// Insert or replace one item.
    async fn upsert(&self, item: &DownloadQueueItem) -> Result<()>;
    /// Drop one item's row.
    async fn remove(&self, id: &str) -> Result<()>;
    /// Drop several items' rows.
    async fn remove_many(&self, ids: &[String]) -> Result<()>;
    /// Drop every row.
    async fn clear(&self) -> Result<()>;
    /// The persisted paused flag.
    async fn is_paused(&self) -> bool;
    /// Persist the paused flag.
    async fn set_paused(&self, paused: bool);
}

/// The real persistence: the `download_queue` table plus a settings flag.
pub struct SqlitePersistence {
    pool: SqlitePool,
    paused: std::sync::Arc<dyn PausedFlag>,
}

impl SqlitePersistence {
    /// Persist into `pool`, with `paused` holding the flag.
    pub fn new(pool: SqlitePool, paused: std::sync::Arc<dyn PausedFlag>) -> Self {
        Self { pool, paused }
    }

    /// Take the pool's connection for the duration of one statement.
    async fn conn(&self) -> Result<sqlx::pool::PoolConnection<sqlx::Sqlite>> {
        self.pool
            .acquire()
            .await
            .map_err(|source| DownloaderError::Database {
                operation: "reach the database",
                source: shiranami_db::DbError::Query {
                    operation: "acquire a connection for the download queue",
                    source,
                },
            })
    }
}

#[async_trait::async_trait]
impl QueuePersistence for SqlitePersistence {
    async fn load(&self) -> Result<Vec<DownloadQueueItem>> {
        let mut conn = self.conn().await?;
        download_queue::load(&mut conn)
            .await
            .map_err(|source| DownloaderError::Database {
                operation: "load the persisted download queue",
                source,
            })
    }

    async fn upsert(&self, item: &DownloadQueueItem) -> Result<()> {
        let mut conn = self.conn().await?;
        download_queue::upsert(&mut conn, item)
            .await
            .map_err(|source| DownloaderError::Database {
                operation: "persist the download queue item",
                source,
            })
    }

    async fn remove(&self, id: &str) -> Result<()> {
        let mut conn = self.conn().await?;
        download_queue::remove(&mut conn, id)
            .await
            .map_err(|source| DownloaderError::Database {
                operation: "remove the persisted download queue item",
                source,
            })
    }

    async fn remove_many(&self, ids: &[String]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn().await?;
        download_queue::remove_many(&mut conn, ids)
            .await
            .map_err(|source| DownloaderError::Database {
                operation: "remove the persisted download queue items",
                source,
            })
    }

    async fn clear(&self) -> Result<()> {
        let mut conn = self.conn().await?;
        download_queue::clear(&mut conn)
            .await
            .map_err(|source| DownloaderError::Database {
                operation: "clear the persisted download queue",
                source,
            })
    }

    async fn is_paused(&self) -> bool {
        self.paused.is_paused().await
    }

    async fn set_paused(&self, paused: bool) {
        self.paused.set_paused(paused).await;
    }
}

/// Persistence that remembers nothing.
///
/// v1's queue took its persistence as optional and ran purely in memory when it
/// was absent. Same shape, as a type rather than a `None`, so the manager has
/// one code path instead of a null check at every write site.
#[derive(Debug, Default)]
pub struct NoPersistence;

#[async_trait::async_trait]
impl QueuePersistence for NoPersistence {
    async fn load(&self) -> Result<Vec<DownloadQueueItem>> {
        Ok(Vec::new())
    }

    async fn upsert(&self, _item: &DownloadQueueItem) -> Result<()> {
        Ok(())
    }

    async fn remove(&self, _id: &str) -> Result<()> {
        Ok(())
    }

    async fn remove_many(&self, _ids: &[String]) -> Result<()> {
        Ok(())
    }

    async fn clear(&self) -> Result<()> {
        Ok(())
    }

    async fn is_paused(&self) -> bool {
        false
    }

    async fn set_paused(&self, _paused: bool) {}
}
