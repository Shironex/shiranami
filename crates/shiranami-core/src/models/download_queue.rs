//! The download queue, ported from
//! `packages/contracts/src/domain/download-queue.ts`.
//!
//! The queue is an in-memory manager write-through persisted to a
//! `download_queue` table so it survives a restart; the renderer mirrors it in a
//! zustand store, hydrated on mount and kept in sync by a `queue-state` event.

use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Number;

/// Download lifecycle status.
///
/// Tracks the **download** only: [`DownloadQueueStatus::Done`] means the file was
/// written to disk, not that it was imported into the library — import is a
/// separate renderer-side concern surfaced via toasts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DownloadQueueStatus {
    /// Waiting for a concurrency slot.
    Queued,
    /// yt-dlp running, downloading.
    Active,
    /// yt-dlp post-processing (`ExtractAudio` / `Merger`).
    Converting,
    /// File written, path known. **Not** yet imported.
    Done,
    /// yt-dlp failed.
    Error,
    /// User cancelled — deliberately distinct from [`DownloadQueueStatus::Error`].
    Canceled,
}

/// One item in the download queue.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DownloadQueueItem {
    /// Canonical identity, generated at enqueue.
    pub id: String,
    /// Source URL passed to yt-dlp. Secondary lookup key for search/playlist.
    pub url: String,
    /// YouTube video id when known; needed to cache the id at import time.
    #[specta(optional)]
    pub youtube_id: Option<String>,
    /// Display title for the row.
    pub title: String,
    /// Artwork URL for the row, when known.
    #[specta(optional)]
    pub thumbnail: Option<String>,
    /// Current lifecycle status.
    pub status: DownloadQueueStatus,
    /// Percentage 0–100. Meaningful while active or converting; `0` when queued.
    #[specta(type = Number)]
    pub progress: f64,
    /// Resolved file path once the status is [`DownloadQueueStatus::Done`].
    #[specta(optional)]
    pub file_path: Option<String>,
    /// Error message when the status is [`DownloadQueueStatus::Error`].
    #[specta(optional)]
    pub error: Option<String>,
    /// Playlist-import batch grouping; absent for single downloads.
    #[specta(optional)]
    pub batch_id: Option<String>,
    /// Position within the batch.
    #[specta(optional)]
    pub batch_index: Option<u32>,
    /// Source playlist title, denormalized onto every batch item so the renderer
    /// can reconstruct the batch coordinator after a restart. This lives only
    /// here on disk, in no renderer store.
    #[specta(optional)]
    pub batch_source_title: Option<String>,
    /// Whether finishing the batch should create a playlist.
    #[specta(optional)]
    pub batch_create_playlist: Option<bool>,
    /// Enqueue time, epoch milliseconds. Orders the queue.
    #[specta(type = Number)]
    pub enqueued_at: i64,
    /// Start time, epoch milliseconds.
    #[specta(optional, type = Option<Number>)]
    pub started_at: Option<i64>,
    /// Finish time, epoch milliseconds. Drives clear-completed.
    #[specta(optional, type = Option<Number>)]
    pub finished_at: Option<i64>,
}

/// The whole queue as the renderer mirrors it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DownloadQueueSnapshot {
    /// Every item, in enqueue order.
    pub items: Vec<DownloadQueueItem>,
    /// How many downloads may run at once.
    pub max_concurrency: u32,
    /// How many are running right now.
    pub active_count: u32,
    /// Whether queued items are being promoted to active.
    pub paused: bool,
}

/// Renderer → main payload to enqueue one download.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueDownloadInput {
    /// Source URL to pass to yt-dlp.
    pub url: String,
    /// YouTube video id when known.
    #[specta(optional)]
    pub youtube_id: Option<String>,
    /// Display title for the row.
    pub title: String,
    /// Artwork URL for the row.
    #[specta(optional)]
    pub thumbnail: Option<String>,
    /// Playlist-import batch grouping.
    #[specta(optional)]
    pub batch_id: Option<String>,
    /// Position within the batch.
    #[specta(optional)]
    pub batch_index: Option<u32>,
    /// Source playlist title. Required together with `batch_id`.
    #[specta(optional)]
    pub batch_source_title: Option<String>,
    /// Whether finishing the batch should create a playlist.
    #[specta(optional)]
    pub batch_create_playlist: Option<bool>,
}
