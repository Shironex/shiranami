/**
 * Phase 0 spike — verify that Electron's `nativeImage` is functional inside a
 * `utilityProcess`. Receives a JPEG/PNG buffer from the parent, runs the same
 * decode + resize + JPEG-encode pipeline that `art-protocol.ts:downscaleImage`
 * uses today, and posts back either the encoded byte length or the failure
 * reason. The parent harness in `scripts/spike-utility-process.cjs` reads the
 * result and prints PASS / FAIL.
 *
 * If this works, Phase 2 can move `saveAlbumArt` into the utility unchanged.
 * If it fails, the user must approve adding `sharp` (heavy native dep) before
 * Phase 2 proceeds.
 */

import { nativeImage } from 'electron';

interface SpikeRequest {
  type: 'spike';
  input: Uint8Array; // structured-clone passes Uint8Array natively
}

interface SpikeResultOk {
  type: 'spike-result';
  ok: true;
  outputSize: number;
  width: number;
  height: number;
}

interface SpikeResultErr {
  type: 'spike-result';
  ok: false;
  error: string;
}

type SpikeResult = SpikeResultOk | SpikeResultErr;

const MAX_DIMENSION = 256;

function runSpike(input: Buffer): SpikeResult {
  try {
    const image = nativeImage.createFromBuffer(input);
    if (image.isEmpty()) {
      return { type: 'spike-result', ok: false, error: 'nativeImage decoded to empty image' };
    }
    const { width, height } = image.getSize();
    const resized = image.resize({ width: MAX_DIMENSION, quality: 'best' });
    const out = resized.toJPEG(85);
    return {
      type: 'spike-result',
      ok: true,
      outputSize: out.length,
      width,
      height,
    };
  } catch (e) {
    return {
      type: 'spike-result',
      ok: false,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

// `parentPort` is exposed on `process` inside an Electron utilityProcess.
// Type stub: cast through `unknown` since @types/node doesn't know about it.
// IMPORTANT: parentPort.on('message') wraps each message in a MessageEvent —
// the actual payload lives at `event.data`. This is asymmetric with the parent
// side, where `UtilityProcess.on('message')` already unwraps to the raw data.
interface ParentPortMessageEvent {
  data: unknown;
}
const parentPort = (
  process as unknown as {
    parentPort?: {
      on(event: 'message', listener: (event: ParentPortMessageEvent) => void): void;
      postMessage(msg: unknown): void;
    };
  }
).parentPort;

if (!parentPort) {
  // Running outside utilityProcess — fail loudly.
  console.error('[scan-utility-spike] parentPort missing — not running inside utilityProcess');
  process.exit(1);
}

parentPort.on('message', event => {
  const msg = event.data as SpikeRequest | undefined;
  if (msg?.type !== 'spike') return;
  const result = runSpike(Buffer.from(msg.input));
  parentPort.postMessage(result);
});

// Signal readiness so the parent knows the IPC listener is wired.
parentPort.postMessage({ type: 'spike-ready' });
