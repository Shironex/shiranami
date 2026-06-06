import { getDatabase } from '@shiranami/database/client';
import { downloadQueue, asc, eq, inArray } from '@shiranami/database';
import type { DownloadQueueItem } from '@shiranami/contracts';
import { store } from './store';
import { logger } from './logger';

/** electron-store key for the persisted queue-paused flag (main-only). */
const PAUSED_KEY = 'downloads.queuePaused';

/**
 * Write-through persistence for the download queue. Every method is best-effort:
 * a DB failure is logged and swallowed so a persistence hiccup can never break
 * the in-memory queue (downloads keep working, they just won't survive the next
 * restart). The queue calls `upsert` on enqueue + on `done`, `remove` on
 * cancel/error, and `clear` on cancel-all; `load` reconstructs the resumable set
 * on boot.
 */
export interface DownloadQueuePersistence {
  /**
   * Load resumable rows in enqueue order. In-flight rows (anything not `done`)
   * are returned as `queued` — there is no mid-download resume, so they
   * re-download from scratch. Progress is reset (0, or 100 for `done`).
   */
  load(): DownloadQueueItem[];
  /** Insert-or-replace a single item by id. */
  upsert(item: DownloadQueueItem): void;
  /** Remove one persisted item by id. */
  remove(id: string): void;
  /** Remove several persisted items by id. */
  removeMany(ids: string[]): void;
  /** Remove every persisted item. */
  clear(): void;
  /** The persisted queue-paused flag (defaults to false). */
  isPaused(): boolean;
  setPaused(paused: boolean): void;
}

/** Map a persisted row back into an in-memory queue item (boot reconstruction). */
function rowToItem(row: typeof downloadQueue.$inferSelect): DownloadQueueItem {
  const status = row.status === 'done' ? 'done' : 'queued';
  return {
    id: row.id,
    url: row.url,
    youtubeId: row.youtubeId ?? undefined,
    title: row.title,
    thumbnail: row.thumbnail ?? undefined,
    status,
    progress: status === 'done' ? 100 : 0,
    filePath: row.filePath ?? undefined,
    error: undefined,
    batchId: row.batchId ?? undefined,
    batchIndex: row.batchIndex ?? undefined,
    batchSourceTitle: row.batchSourceTitle ?? undefined,
    batchCreatePlaylist: row.batchCreatePlaylist ?? undefined,
    enqueuedAt: row.enqueuedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

/** Map an in-memory item into the persisted row shape. */
function itemToRow(item: DownloadQueueItem): typeof downloadQueue.$inferInsert {
  return {
    id: item.id,
    url: item.url,
    youtubeId: item.youtubeId ?? null,
    title: item.title,
    thumbnail: item.thumbnail ?? null,
    status: item.status,
    filePath: item.filePath ?? null,
    batchId: item.batchId ?? null,
    batchIndex: item.batchIndex ?? null,
    batchSourceTitle: item.batchSourceTitle ?? null,
    batchCreatePlaylist: item.batchCreatePlaylist ?? null,
    enqueuedAt: item.enqueuedAt,
    startedAt: item.startedAt ?? null,
    finishedAt: item.finishedAt ?? null,
  };
}

export function createDownloadQueuePersistence(): DownloadQueuePersistence {
  return {
    load() {
      try {
        const rows = getDatabase()
          .select()
          .from(downloadQueue)
          .orderBy(asc(downloadQueue.enqueuedAt))
          .all();
        return rows.map(rowToItem);
      } catch (err) {
        logger.warn('[download-queue] Failed to load persisted queue:', err);
        return [];
      }
    },

    upsert(item) {
      try {
        const row = itemToRow(item);
        getDatabase()
          .insert(downloadQueue)
          .values(row)
          .onConflictDoUpdate({ target: downloadQueue.id, set: row })
          .run();
      } catch (err) {
        logger.warn('[download-queue] Failed to persist item:', err);
      }
    },

    remove(id) {
      try {
        getDatabase().delete(downloadQueue).where(eq(downloadQueue.id, id)).run();
      } catch (err) {
        logger.warn('[download-queue] Failed to remove persisted item:', err);
      }
    },

    removeMany(ids) {
      if (ids.length === 0) return;
      try {
        getDatabase().delete(downloadQueue).where(inArray(downloadQueue.id, ids)).run();
      } catch (err) {
        logger.warn('[download-queue] Failed to remove persisted items:', err);
      }
    },

    clear() {
      try {
        getDatabase().delete(downloadQueue).run();
      } catch (err) {
        logger.warn('[download-queue] Failed to clear persisted queue:', err);
      }
    },

    isPaused() {
      return store.get(PAUSED_KEY, false);
    },

    setPaused(paused) {
      store.set(PAUSED_KEY, paused);
    },
  };
}
