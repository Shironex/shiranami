/**
 * Phase 0 spike (sharp variant) — verify that `sharp` decode + resize + JPEG-
 * encode works inside an Electron `utilityProcess`.
 *
 * History: the original spike tested `nativeImage` from `electron`; that
 * failed because `nativeImage` is undefined inside utilityProcess (it's a
 * main/renderer-only API). User picked Option A from the spike-result doc:
 * add `sharp` as a native dep. This retargeted spike confirms the Phase 2
 * design works with sharp before we commit to the rest of the work.
 *
 * Receives a JPEG/PNG buffer from the parent, runs sharp's decode pipeline,
 * and posts back the encoded byte length or the failure reason. The parent
 * harness in `scripts/spike-utility-process.cjs` reads the result and prints
 * PASS / FAIL.
 */

import sharp from 'sharp';

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

async function runSpike(input: Buffer): Promise<SpikeResult> {
  try {
    const pipeline = sharp(input);
    const meta = await pipeline.metadata();
    const out = await pipeline
      .resize({ width: MAX_DIMENSION, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      type: 'spike-result',
      ok: true,
      outputSize: out.length,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
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
  void runSpike(Buffer.from(msg.input)).then(result => {
    parentPort.postMessage(result);
  });
});

// Signal readiness so the parent knows the IPC listener is wired.
parentPort.postMessage({ type: 'spike-ready' });
