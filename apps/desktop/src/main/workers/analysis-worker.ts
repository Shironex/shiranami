/**
 * Worker thread: estimate a file's tempo (BPM) and musical key via the native
 * addon's analysis module.
 *
 * Runs off the main thread (mirrors waveform-worker.ts / loudness-worker.ts) so
 * decoding + analysing a full track never blocks IPC during a batch run. The
 * addon path is resolved by the host — which has access to Electron's `app` for
 * the packaged-vs-dev split — and passed in as workerData. This worker just
 * loads it and calls `analysis.fromFile`.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';

interface WorkerInit {
  addonPath: string;
}

interface AnalyzeRequest {
  id: number;
  filePath: string;
}

/** Discriminated result from the native addon — see core/analysis.hpp. */
type NativeAnalysisResult = { status: 'ok'; bpm: number; key: string } | { status: 'unanalyzable' };

interface AnalysisAddon {
  analysis: {
    fromFile: (path: string) => NativeAnalysisResult;
  };
}

const { addonPath } = workerData as WorkerInit;

// Load the native addon once. createRequire(__filename) yields a real CommonJS
// require even though esbuild bundles this file, so the dynamic .node path is
// left intact (esbuild only rewrites the literal `require` identifier). If the
// addon is missing — e.g. the native build was skipped — every analysis reports
// 'unanalyzable' and the service persists nothing for that track.
let addon: AnalysisAddon | null = null;
try {
  const requireNative = createRequire(__filename);
  addon = requireNative(addonPath) as AnalysisAddon;
} catch {
  addon = null;
}

/** Analyse one file, mapping a missing addon or native throw onto
 *  'unanalyzable' so the service treats it as "nothing to persist". */
function analyze(filePath: string): NativeAnalysisResult {
  try {
    return addon?.analysis.fromFile(filePath) ?? { status: 'unanalyzable' };
  } catch {
    return { status: 'unanalyzable' };
  }
}

parentPort?.on('message', (msg: AnalyzeRequest) => {
  parentPort?.postMessage({ id: msg.id, result: analyze(msg.filePath) });
});
