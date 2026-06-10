/**
 * Persisted download queue.
 *
 * The download queue is an in-memory manager in the desktop main process, but
 * its rows are write-through persisted here so the queue survives an app
 * restart. Only resumable / recoverable items are kept: `queued` items (resume
 * downloading) and `done` items (recover a file that was downloaded but not yet
 * imported when the app closed). `active`/`converting` items are stored as
 * `queued` — there is no mid-download resume protocol, so on restart they simply
 * re-download from scratch. `error` / `canceled` items are NOT persisted (they
 * carry no resume action), and a row is deleted once its track has been imported
 * into the library.
 *
 * `progress` and `error` are intentionally absent: progress is transient (it
 * resets to 0 on restart) and error rows are never persisted, so neither needs a
 * column.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Download lifecycle status. Kept in lockstep with the canonical
 * `DownloadQueueStatus` union in `@shiranami/contracts` (domain/download-queue).
 * Redeclared locally because this package must not depend on `@shiranami/contracts`.
 * Type-level only — applied via `.$type<>()` so the generated SQL is unchanged.
 */
export type DownloadQueueStatus =
  | 'queued'
  | 'active'
  | 'converting'
  | 'done'
  | 'error'
  | 'canceled';

export const downloadQueue = sqliteTable('download_queue', {
  /** Canonical queue-item id (must equal the runtime id so the renderer's batch
   * coordinator, which keys on item id, reconstructs correctly). */
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  youtubeId: text('youtube_id'),
  title: text('title').notNull(),
  thumbnail: text('thumbnail'),
  status: text('status').notNull().$type<DownloadQueueStatus>(),
  filePath: text('file_path'),
  /** Playlist-import batch grouping (null for single downloads). */
  batchId: text('batch_id'),
  batchIndex: integer('batch_index'),
  /** Batch intent — denormalized so a batch can be fully reconstructed on boot. */
  batchSourceTitle: text('batch_source_title'),
  batchCreatePlaylist: integer('batch_create_playlist', { mode: 'boolean' }),
  /** Timestamps (ms epoch). */
  enqueuedAt: integer('enqueued_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
});

export type DownloadQueueRow = typeof downloadQueue.$inferSelect;
export type NewDownloadQueueRow = typeof downloadQueue.$inferInsert;
