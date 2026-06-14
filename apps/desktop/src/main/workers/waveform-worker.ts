/**
 * Worker thread: decode an audio file to waveform peaks via the native addon.
 *
 * Runs off the main thread (mirrors extract-worker.ts) so a first-play decode
 * never delays IPC. The addon path is resolved by the host — which has access
 * to Electron's `app` for the packaged-vs-dev split — and passed in as
 * workerData. This worker just loads it and calls `waveformFromFile`.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';

interface WorkerInit {
  addonPath: string;
}

interface DecodeRequest {
  id: number;
  filePath: string;
  buckets: number;
}

interface WaveformAddon {
  waveform: {
    fromFile: (path: string, buckets: number) => { peaks: Float32Array } | null;
  };
}

const { addonPath } = workerData as WorkerInit;

// Load the native addon once. createRequire(__filename) yields a real CommonJS
// require even though esbuild bundles this file, so the dynamic .node path is
// left intact (esbuild only rewrites the literal `require` identifier). If the
// addon is missing — e.g. the native build was skipped — every decode degrades
// to null and the seekbar falls back to a flat bar.
let addon: WaveformAddon | null = null;
try {
  const requireNative = createRequire(__filename);
  addon = requireNative(addonPath) as WaveformAddon;
} catch {
  addon = null;
}

parentPort?.on('message', (msg: DecodeRequest) => {
  let peaks: number[] | null = null;
  try {
    const result = addon?.waveform.fromFile(msg.filePath, msg.buckets) ?? null;
    // The addon returns a Float32Array across the N-API boundary; convert to a
    // plain array so it both structured-clones and matches the on-disk JSON.
    if (result?.peaks) peaks = Array.from(result.peaks);
  } catch {
    peaks = null;
  }
  parentPort?.postMessage({ id: msg.id, peaks });
});
