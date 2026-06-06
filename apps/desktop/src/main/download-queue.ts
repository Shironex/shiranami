import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type {
  DownloadQueueItem,
  DownloadQueueSnapshot,
  EnqueueDownloadInput,
} from '@shiranami/contracts';
import { logger } from './logger';
import { sendToRenderer } from './utils/window';
import { runYtDlpDownload, type DownloadProgress } from './yt-dlp-download';
import type { DownloadQueuePersistence } from './download-queue-persistence';

const C = IPC_CHANNELS.downloader;

/** Only this many items download concurrently; the rest stay `queued`. */
export const MAX_CONCURRENCY = 3;

/** Trailing throttle window for progress-only broadcasts (~4/sec). */
const PROGRESS_THROTTLE_MS = 250;

/**
 * The download runner the queue drives. Defaults to the real `runYtDlpDownload`;
 * injectable so unit tests can exercise the concurrency gate and cancel→canceled
 * disambiguation without spawning real yt-dlp processes.
 */
export type DownloadRunner = (
  options: { url: string; downloadDir: string },
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal
) => Promise<string>;

export interface DownloadQueueDeps {
  /** Resolves the directory downloads are written to (created lazily). */
  getDownloadDir: () => string;
  /** The yt-dlp download runner (overridable in tests). */
  runner?: DownloadRunner;
  /** Broadcast a snapshot to the renderer (overridable in tests). */
  broadcast?: (snapshot: DownloadQueueSnapshot) => void;
  /**
   * Write-through persistence so the queue survives an app restart. Optional:
   * when omitted (tests), the queue is purely in-memory as before.
   */
  persistence?: DownloadQueuePersistence;
}

/**
 * In-memory download queue manager, write-through persisted so it survives an
 * app restart. Owns the yt-dlp child processes, enforces a fixed concurrency
 * limit, and broadcasts the full snapshot to the renderer on every structural
 * change (progress ticks are throttled). Status is the source of truth for the
 * renderer mirror. `pause()` stops promoting queued items (in-flight downloads
 * run to completion); `hydrateAndResume()` reloads persisted rows on boot.
 */
export class DownloadQueue {
  /** Insertion order = enqueue order = FIFO scheduling order. */
  private readonly items = new Map<string, DownloadQueueItem>();
  private readonly abortControllers = new Map<string, AbortController>();

  private readonly getDownloadDir: () => string;
  private readonly runner: DownloadRunner;
  private readonly broadcastSnapshot: (snapshot: DownloadQueueSnapshot) => void;
  private readonly persistence?: DownloadQueuePersistence;

  /** When true, `pump()` promotes nothing — queued items wait for `resume()`. */
  private paused = false;

  private progressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: DownloadQueueDeps) {
    this.getDownloadDir = deps.getDownloadDir;
    this.runner = deps.runner ?? runYtDlpDownload;
    this.broadcastSnapshot = deps.broadcast ?? (snapshot => sendToRenderer(C.queueState, snapshot));
    this.persistence = deps.persistence;
  }

  /**
   * Reload the persisted queue and resume downloading. Called once at boot,
   * AFTER the database is initialized (decoupled from the constructor so
   * construction never spawns downloads or touches an uninitialized DB).
   * In-flight rows were persisted as `queued`, so they simply re-download.
   */
  hydrateAndResume(): void {
    if (!this.persistence) return;
    // Best-effort: a failure reading persisted state must never abort the
    // surrounding IPC registration (which would silently skip every handler
    // registered after the downloader).
    try {
      this.paused = this.persistence.isPaused();
      const restored = this.persistence.load();
      for (const item of restored) {
        this.items.set(item.id, item);
      }
      if (restored.length > 0) {
        logger.info(
          `[download-queue] Restored ${restored.length} item(s) from disk` +
            (this.paused ? ' (paused)' : '')
        );
      }
      this.broadcast();
      this.pump();
    } catch (err) {
      logger.warn('[download-queue] Failed to hydrate persisted queue:', err);
    }
  }

  enqueue(input: EnqueueDownloadInput): string {
    const id = randomUUID();
    const item: DownloadQueueItem = {
      id,
      url: input.url,
      youtubeId: input.youtubeId,
      title: input.title,
      thumbnail: input.thumbnail,
      status: 'queued',
      progress: 0,
      batchId: input.batchId,
      batchIndex: input.batchIndex,
      batchSourceTitle: input.batchSourceTitle,
      batchCreatePlaylist: input.batchCreatePlaylist,
      enqueuedAt: Date.now(),
    };
    this.items.set(id, item);
    this.persistence?.upsert(item);
    this.broadcast();
    this.pump();
    return id;
  }

  /** Stop promoting queued items. In-flight downloads run to completion. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.persistence?.setPaused(true);
    this.broadcast();
  }

  /** Resume promoting queued items. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.persistence?.setPaused(false);
    this.broadcast();
    this.pump();
  }

  /**
   * Cancel the entire queue: abort every in-flight download (killing its child
   * + cleaning partial files via the runner's abort path), drop all items, and
   * clear persistence. Paused state is reset so a fresh enqueue starts normally.
   */
  cancelAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.items.clear();
    this.persistence?.clear();
    if (this.paused) {
      this.paused = false;
      this.persistence?.setPaused(false);
    }
    this.broadcast();
  }

  /**
   * Drop rows for items the renderer has finished importing into the library so
   * they aren't re-imported on the next launch. Single-download items keep their
   * in-memory entry (they clear via clearCompleted, like before); batch items —
   * which clearCompleted intentionally skips to protect restart reconstruction —
   * are removed from the in-memory queue here too, so a resolved batch's rows
   * disappear from the view once its playlist has been created.
   */
  markImported(ids: string[]): void {
    this.persistence?.removeMany(ids);
    let changed = false;
    for (const id of ids) {
      const item = this.items.get(id);
      if (item?.batchId) {
        this.items.delete(id);
        changed = true;
      }
    }
    if (changed) this.broadcast();
  }

  cancel(id: string): void {
    const item = this.items.get(id);
    if (!item) return;

    if (item.status === 'queued') {
      // Never started: mark canceled directly (no child to kill).
      item.status = 'canceled';
      item.finishedAt = Date.now();
      this.persistence?.remove(id);
      this.broadcast();
      return;
    }

    if (item.status === 'active' || item.status === 'converting') {
      // Kill the child; the runner rejects with an abort sentinel and the
      // reject handler maps it to `canceled`.
      this.abortControllers.get(id)?.abort();
      return;
    }
    // Terminal (done/error/canceled): no-op.
  }

  clearCompleted(): void {
    const removed: string[] = [];
    for (const [id, item] of this.items) {
      if (item.status === 'done' || item.status === 'error' || item.status === 'canceled') {
        // Batch items are lifecycle-managed: they must stay in the queue AND
        // persistence until the batch coordinator resolves and removes them via
        // markImported(). Clearing a batch's done items early would drop their
        // persisted rows, so a restart before the batch finishes reconstructs it
        // with fewer items — recreating the playlist without the cleared tracks
        // (and never importing them). They are removed in markImported() instead.
        if (item.batchId) continue;
        this.items.delete(id);
        removed.push(id);
      }
    }
    this.persistence?.removeMany(removed);
    this.broadcast();
  }

  getSnapshot(): DownloadQueueSnapshot {
    return {
      items: [...this.items.values()],
      maxConcurrency: MAX_CONCURRENCY,
      activeCount: this.activeCount(),
      paused: this.paused,
    };
  }

  /** Count of items occupying a concurrency slot (downloading or converting). */
  private activeCount(): number {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.status === 'active' || item.status === 'converting') count++;
    }
    return count;
  }

  /** Concurrency gate: promote queued items (FIFO) while slots are free. */
  private pump(): void {
    if (this.paused) return;
    for (const item of this.items.values()) {
      if (this.activeCount() >= MAX_CONCURRENCY) break;
      if (item.status !== 'queued') continue;
      this.start(item);
    }
  }

  private start(item: DownloadQueueItem): void {
    item.status = 'active';
    item.startedAt = Date.now();

    const controller = new AbortController();
    this.abortControllers.set(item.id, controller);
    this.broadcast();

    let run: Promise<string>;
    try {
      const downloadDir = this.getDownloadDir();
      run = this.runner(
        { url: item.url, downloadDir },
        progress => this.onProgress(item.id, progress),
        controller.signal
      );
    } catch (err: unknown) {
      // A synchronous throw (e.g. resolving the download dir) before the
      // promise chain is attached would otherwise leave the item stuck
      // 'active' with a live controller, wedging the concurrency slot so
      // queued items never promote. Settle it as an error and free the slot.
      const current = this.items.get(item.id);
      if (current) {
        current.status = 'error';
        current.error = err instanceof Error ? err.message : String(err);
        current.finishedAt = Date.now();
        // Terminal failure carries no resume action — drop its persisted row.
        this.persistence?.remove(current.id);
      }
      this.abortControllers.delete(item.id);
      this.broadcast();
      this.pump();
      return;
    }

    run
      .then(filePath => {
        const current = this.items.get(item.id);
        if (current) {
          current.status = 'done';
          current.filePath = filePath;
          current.progress = 100;
          current.finishedAt = Date.now();
          // Persist the resolved path so a crash before import recovers the file.
          this.persistence?.upsert(current);
        }
        this.abortControllers.delete(item.id);
        this.broadcast();
        this.pump();
      })
      .catch((err: unknown) => {
        const current = this.items.get(item.id);
        if (current) {
          if (controller.signal.aborted) {
            current.status = 'canceled';
          } else {
            current.status = 'error';
            current.error = err instanceof Error ? err.message : String(err);
          }
          current.finishedAt = Date.now();
          // error / canceled don't resume — drop the persisted row.
          this.persistence?.remove(current.id);
        }
        this.abortControllers.delete(item.id);
        this.broadcast();
        this.pump();
      });
  }

  private onProgress(id: string, progress: DownloadProgress): void {
    const item = this.items.get(id);
    if (!item) return;

    if (progress.status === 'downloading') {
      item.status = 'active';
      item.progress = progress.progress;
      this.broadcastProgress();
    } else if (progress.status === 'converting') {
      // Status transition (active → converting): flush immediately.
      item.status = 'converting';
      item.progress = 100;
      this.broadcast();
    }
    // `done` / `error` are handled in the runner's resolve/reject.
  }

  /** Structural change: broadcast immediately and cancel any pending tick. */
  private broadcast(): void {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    this.broadcastSnapshot(this.getSnapshot());
  }

  /** Progress-only change: coalesce into a trailing ~250ms tick. */
  private broadcastProgress(): void {
    if (this.progressTimer) return;
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      this.broadcastSnapshot(this.getSnapshot());
    }, PROGRESS_THROTTLE_MS);
    // Don't keep the event loop alive solely for a queued progress tick.
    this.progressTimer.unref?.();
  }
}

let queueInstance: DownloadQueue | null = null;

/** Lazily construct and return the singleton download queue. */
export function getDownloadQueue(deps: DownloadQueueDeps): DownloadQueue {
  if (!queueInstance) {
    queueInstance = new DownloadQueue(deps);
    logger.info('[download-queue] Initialized download queue manager');
  }
  return queueInstance;
}
