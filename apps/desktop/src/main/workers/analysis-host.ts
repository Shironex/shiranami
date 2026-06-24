/**
 * Host for the native analysis worker (tempo + key).
 *
 * Lazily spawns a single long-lived worker_threads worker, resolves the native
 * addon path (packaged vs dev), and exposes a promise-based analysis call.
 * Every failure mode resolves to `{ status: 'unanalyzable' }` rather than
 * rejecting — a missing addon, spawn failure, or worker crash all degrade to
 * "nothing to persist" in analysis-service rather than surfacing an error.
 *
 * Deliberately mirrors loudness-host.ts (an established per-feature convention).
 */

import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { logger } from '../app/logger';
import { getNativeAddonPath } from '../shared/native-addon';

/** Discriminated result from the native addon — see core/analysis.hpp. */
export type NativeAnalysisResult =
  | { status: 'ok'; bpm: number; key: string }
  | { status: 'unanalyzable' };

interface WorkerReply {
  id: number;
  result: NativeAnalysisResult;
}

const UNANALYZABLE: NativeAnalysisResult = { status: 'unanalyzable' };

let worker: Worker | null = null;
// Monotonic request id — MUST stay monotonic across worker respawns (never
// reset in failAllPending or shutdown). Because ids only ever climb, a late
// reply from a dead worker carries an id absent from `pending` and is dropped
// instead of resolving a live request. Resetting it would let a stale reply
// resolve the wrong request — persisting wrong tempo/key onto the track row.
let nextId = 1;
const pending = new Map<number, (result: NativeAnalysisResult) => void>();

/** Resolve every in-flight request as unanalyzable and drop the worker so the
 *  next call respawns it. Used on worker error/exit. */
function failAllPending(): void {
  // Terminate before dropping the reference: on an 'error' event the thread may
  // still be alive (or wedged), and losing the handle would leak it. terminate()
  // is a harmless no-op when the worker has already exited.
  if (worker) void worker.terminate();
  for (const resolve of pending.values()) resolve(UNANALYZABLE);
  pending.clear();
  worker = null;
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(path.join(__dirname, 'analysis-worker.js'), {
      workerData: { addonPath: getNativeAddonPath() },
    });
    worker.on('message', (msg: WorkerReply) => {
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg.result);
      }
    });
    worker.on('error', err => {
      logger.error('[analysis] worker error:', err);
      failAllPending();
    });
    worker.on('exit', code => {
      if (code !== 0) logger.warn(`[analysis] worker exited with code ${code}`);
      failAllPending();
    });
  } catch (error) {
    logger.error('[analysis] failed to spawn worker:', error);
    worker = null;
  }
  return worker;
}

/**
 * Analyse a file's tempo + key off the main thread. Resolves
 * `{ status: 'unanalyzable' }` when the addon is unavailable or the worker dies —
 * never rejects — so the caller can persist nothing for that track.
 */
export function analyzeTrackNative(filePath: string): Promise<NativeAnalysisResult> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(UNANALYZABLE);
  const id = nextId++;
  return new Promise<NativeAnalysisResult>(resolve => {
    pending.set(id, resolve);
    try {
      w.postMessage({ id, filePath });
    } catch (error) {
      // Worker died between ensureWorker() and postMessage — honour the
      // never-rejects contract instead of leaking a pending resolver.
      pending.delete(id);
      logger.warn('[analysis] failed to post analyze job:', error);
      resolve(UNANALYZABLE);
    }
  });
}

/** Terminate the worker (called on IPC cleanup / app teardown). */
export function shutdownAnalysisWorker(): void {
  if (worker) {
    void worker.terminate();
    worker = null;
  }
  for (const resolve of pending.values()) resolve(UNANALYZABLE);
  pending.clear();
}
