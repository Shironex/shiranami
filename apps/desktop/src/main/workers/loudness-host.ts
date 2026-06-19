/**
 * Host for the native loudness worker.
 *
 * Lazily spawns a single long-lived worker_threads worker, resolves the native
 * addon path (packaged vs dev), and exposes a promise-based measurement call.
 * Every failure mode resolves to `{ status: 'undecodable' }` rather than
 * rejecting — a missing addon, spawn failure, or worker crash all degrade to
 * the ffmpeg fallback in loudness-service rather than surfacing an error.
 */

import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { logger } from '../app/logger';
import { getNativeAddonPath } from '../shared/native-addon';

/** Discriminated result from the native addon — see core/loudness.hpp. */
export type NativeLoudnessResult =
  | { status: 'ok'; lufs: number }
  | { status: 'silent' }
  | { status: 'undecodable' };

interface WorkerReply {
  id: number;
  result: NativeLoudnessResult;
}

const UNDECODABLE: NativeLoudnessResult = { status: 'undecodable' };

let worker: Worker | null = null;
// Monotonic request id — MUST stay monotonic across worker respawns (never
// reset in failAllPending or shutdown). Because ids only ever climb, a late
// reply from a dead worker carries an id absent from `pending` and is dropped
// instead of resolving a live request. Resetting it would let a stale reply
// resolve the wrong request — persisting a wrong loudness value to the track row.
let nextId = 1;
const pending = new Map<number, (result: NativeLoudnessResult) => void>();

/** Resolve every in-flight request as undecodable (→ ffmpeg fallback) and drop
 *  the worker so the next call respawns it. Used on worker error/exit. */
function failAllPending(): void {
  // Terminate before dropping the reference: on an 'error' event the thread may
  // still be alive (or wedged), and losing the handle would leak it. terminate()
  // is a harmless no-op when the worker has already exited.
  if (worker) void worker.terminate();
  for (const resolve of pending.values()) resolve(UNDECODABLE);
  pending.clear();
  worker = null;
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(path.join(__dirname, 'loudness-worker.js'), {
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
      logger.error('[loudness] worker error:', err);
      failAllPending();
    });
    worker.on('exit', code => {
      if (code !== 0) logger.warn(`[loudness] worker exited with code ${code}`);
      failAllPending();
    });
  } catch (error) {
    logger.error('[loudness] failed to spawn worker:', error);
    worker = null;
  }
  return worker;
}

/**
 * Measure a file's integrated loudness off the main thread. Resolves
 * `{ status: 'undecodable' }` when the addon is unavailable or the worker dies —
 * never rejects — so the caller can fall back to ffmpeg.
 */
export function measureLoudnessNative(filePath: string): Promise<NativeLoudnessResult> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(UNDECODABLE);
  const id = nextId++;
  return new Promise<NativeLoudnessResult>(resolve => {
    pending.set(id, resolve);
    try {
      w.postMessage({ id, filePath });
    } catch (error) {
      // Worker died between ensureWorker() and postMessage — honour the
      // never-rejects contract instead of leaking a pending resolver.
      pending.delete(id);
      logger.warn('[loudness] failed to post measure job:', error);
      resolve(UNDECODABLE);
    }
  });
}

/** Terminate the worker (called on IPC cleanup / app teardown). */
export function shutdownLoudnessWorker(): void {
  if (worker) {
    void worker.terminate();
    worker = null;
  }
  for (const resolve of pending.values()) resolve(UNDECODABLE);
  pending.clear();
}
