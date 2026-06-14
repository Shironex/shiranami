/**
 * Host for the waveform decode worker.
 *
 * Lazily spawns a single long-lived worker_threads worker, resolves the native
 * addon path (packaged vs dev), and exposes a promise-based decode call. Every
 * failure mode resolves to `null` rather than rejecting — a missing addon,
 * spawn failure, or undecodable file all degrade the seekbar to a flat bar
 * instead of surfacing an error.
 */

import { app } from 'electron';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { logger } from './logger';

/** Resolve the compiled addon. Mirrors shiroani's getAddonPath dev/packaged
 *  split; the packaged path requires the electron-builder extraResources copy. */
function getAddonPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native', 'shiranami_native.node');
  }
  // __dirname is dist/main in dev; the addon lives at apps/desktop/build/Release.
  return path.join(__dirname, '../../build/Release/shiranami_native.node');
}

interface WorkerReply {
  id: number;
  peaks: number[] | null;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (peaks: number[] | null) => void>();

/** Resolve every in-flight request with null and drop the worker so the next
 *  call respawns it. Used on worker error/exit. */
function failAllPending(): void {
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
  worker = null;
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(path.join(__dirname, 'waveform-worker.js'), {
      workerData: { addonPath: getAddonPath() },
    });
    worker.on('message', (msg: WorkerReply) => {
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg.peaks);
      }
    });
    worker.on('error', err => {
      logger.error('[waveform] worker error:', err);
      failAllPending();
    });
    worker.on('exit', code => {
      if (code !== 0) logger.warn(`[waveform] worker exited with code ${code}`);
      failAllPending();
    });
  } catch (error) {
    logger.error('[waveform] failed to spawn worker:', error);
    worker = null;
  }
  return worker;
}

/**
 * Decode waveform peaks for a file off the main thread. Resolves null when the
 * addon is unavailable or the format can't be decoded natively — never rejects.
 */
export function decodeWaveformPeaks(filePath: string, buckets: number): Promise<number[] | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = nextId++;
  return new Promise<number[] | null>(resolve => {
    pending.set(id, resolve);
    try {
      w.postMessage({ id, filePath, buckets });
    } catch (error) {
      // Worker died between ensureWorker() and postMessage — honour the
      // never-rejects contract instead of leaking a pending resolver.
      pending.delete(id);
      logger.warn('[waveform] failed to post decode job:', error);
      resolve(null);
    }
  });
}

/** Terminate the worker (called on IPC cleanup / app teardown). */
export function shutdownWaveformWorker(): void {
  if (worker) {
    void worker.terminate();
    worker = null;
  }
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
}
