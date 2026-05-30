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
}

/**
 * In-memory download queue manager. Owns the yt-dlp child processes, enforces a
 * fixed concurrency limit, and broadcasts the full snapshot to the renderer on
 * every structural change (progress ticks are throttled). Status is the source
 * of truth for the renderer mirror; the queue resets on app restart.
 */
export class DownloadQueue {
  /** Insertion order = enqueue order = FIFO scheduling order. */
  private readonly items = new Map<string, DownloadQueueItem>();
  private readonly abortControllers = new Map<string, AbortController>();

  private readonly getDownloadDir: () => string;
  private readonly runner: DownloadRunner;
  private readonly broadcastSnapshot: (snapshot: DownloadQueueSnapshot) => void;

  private progressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: DownloadQueueDeps) {
    this.getDownloadDir = deps.getDownloadDir;
    this.runner = deps.runner ?? runYtDlpDownload;
    this.broadcastSnapshot = deps.broadcast ?? (snapshot => sendToRenderer(C.queueState, snapshot));
  }

  enqueue(input: EnqueueDownloadInput): string {
    const id = randomUUID();
    const item: DownloadQueueItem = {
      id,
      url: input.url,
      youtubeId: input.youtubeId,
      title: input.title,
      status: 'queued',
      progress: 0,
      batchId: input.batchId,
      batchIndex: input.batchIndex,
      enqueuedAt: Date.now(),
    };
    this.items.set(id, item);
    this.broadcast();
    this.pump();
    return id;
  }

  cancel(id: string): void {
    const item = this.items.get(id);
    if (!item) return;

    if (item.status === 'queued') {
      // Never started: mark canceled directly (no child to kill).
      item.status = 'canceled';
      item.finishedAt = Date.now();
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
    for (const [id, item] of this.items) {
      if (item.status === 'done' || item.status === 'error' || item.status === 'canceled') {
        this.items.delete(id);
      }
    }
    this.broadcast();
  }

  getSnapshot(): DownloadQueueSnapshot {
    return {
      items: [...this.items.values()],
      maxConcurrency: MAX_CONCURRENCY,
      activeCount: this.activeCount(),
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

    const downloadDir = this.getDownloadDir();

    this.runner(
      { url: item.url, downloadDir },
      progress => this.onProgress(item.id, progress),
      controller.signal
    )
      .then(filePath => {
        const current = this.items.get(item.id);
        if (current) {
          current.status = 'done';
          current.filePath = filePath;
          current.progress = 100;
          current.finishedAt = Date.now();
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
