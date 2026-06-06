// Domain types for the main-process download queue. The queue is an in-memory
// manager in the desktop main process, write-through persisted to a
// `download_queue` table so it survives an app restart; the renderer mirrors it
// in a zustand store, hydrated on mount and kept in sync by a `queue-state`
// event. On restart the main process reloads pending/in-progress rows (resetting
// in-flight items to `queued`) and resumes downloading unless the queue is paused.

/**
 * Download lifecycle status. Tracks the DOWNLOAD only — `done` means the file
 * was written to disk, NOT that it was imported into the library (import is a
 * separate renderer-side concern surfaced via toasts).
 */
export type DownloadQueueStatus =
  | 'queued' // waiting for a concurrency slot
  | 'active' // yt-dlp running, downloading
  | 'converting' // yt-dlp post-processing (ExtractAudio/Merger)
  | 'done' // file written, path known (NOT yet imported)
  | 'error' // yt-dlp failed
  | 'canceled'; // user cancelled (distinct from error)

export interface DownloadQueueItem {
  /** Canonical identity. Generated at enqueue (randomUUID). */
  id: string;
  /** Source URL passed to yt-dlp. Secondary lookup key (search/playlist). */
  url: string;
  /**
   * YouTube video id when known (recommendations). Secondary lookup key +
   * needed for cacheYoutubeId at import time.
   */
  youtubeId?: string;
  /** Display title for the row. */
  title: string;
  /** Artwork URL for the row (from the search/import result), when known. */
  thumbnail?: string;
  status: DownloadQueueStatus;
  /** 0–100. Meaningful for active/converting; 0 when queued. */
  progress: number;
  /** Resolved file path once status === 'done'. */
  filePath?: string;
  /** Translated/raw error message when status === 'error'. */
  error?: string;
  /** Playlist-import batch grouping (absent for single downloads). */
  batchId?: string;
  batchIndex?: number;
  /**
   * Batch intent, denormalized onto every batch item so the renderer can
   * reconstruct the batch coordinator after a restart (import in order +
   * recreate the playlist) — these live only here on disk, not in any renderer
   * store. Absent for single downloads.
   */
  batchSourceTitle?: string | null;
  batchCreatePlaylist?: boolean;
  /** Timestamps (ms epoch) for ordering + clear-completed. */
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface DownloadQueueSnapshot {
  items: DownloadQueueItem[];
  maxConcurrency: number;
  activeCount: number;
  /** Whether the queue is paused (no queued items will be promoted to active). */
  paused: boolean;
}

export interface EnqueueDownloadInput {
  url: string;
  youtubeId?: string;
  title: string;
  thumbnail?: string;
  batchId?: string;
  batchIndex?: number;
  /** Batch intent (see `DownloadQueueItem`) — required together with `batchId`. */
  batchSourceTitle?: string | null;
  batchCreatePlaylist?: boolean;
}
