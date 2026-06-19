/**
 * Worker thread: measure a file's integrated loudness (LUFS) via the native
 * addon's libebur128 module.
 *
 * Runs off the main thread (mirrors waveform-worker.ts) so decoding + analysing
 * a full track never blocks IPC during a batch run. The addon path is resolved
 * by the host — which has access to Electron's `app` for the packaged-vs-dev
 * split — and passed in as workerData. This worker just loads it and calls
 * `loudness.fromFile`.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';

interface WorkerInit {
  addonPath: string;
}

interface MeasureRequest {
  id: number;
  filePath: string;
}

/** Discriminated result from the native addon — see core/loudness.hpp. */
type NativeLoudnessResult =
  | { status: 'ok'; lufs: number }
  | { status: 'silent' }
  | { status: 'undecodable' };

interface LoudnessAddon {
  loudness: {
    fromFile: (path: string) => NativeLoudnessResult;
  };
}

const { addonPath } = workerData as WorkerInit;

// Load the native addon once. createRequire(__filename) yields a real CommonJS
// require even though esbuild bundles this file, so the dynamic .node path is
// left intact (esbuild only rewrites the literal `require` identifier). If the
// addon is missing — e.g. the native build was skipped — every measurement
// reports 'undecodable' and the service falls back to the ffmpeg path.
let addon: LoudnessAddon | null = null;
try {
  const requireNative = createRequire(__filename);
  addon = requireNative(addonPath) as LoudnessAddon;
} catch {
  addon = null;
}

/** Measure one file, mapping a missing addon or native throw onto 'undecodable'
 *  so the service falls back to ffmpeg. */
function measure(filePath: string): NativeLoudnessResult {
  try {
    return addon?.loudness.fromFile(filePath) ?? { status: 'undecodable' };
  } catch {
    return { status: 'undecodable' };
  }
}

parentPort?.on('message', (msg: MeasureRequest) => {
  parentPort?.postMessage({ id: msg.id, result: measure(msg.filePath) });
});
