/**
 * Shared helper for locating the compiled native addon (shiranami_native.node).
 *
 * One binary hosts every native module (waveform, loudness, …), so every worker
 * host resolves it the same way. Centralised here so the dev/packaged split
 * lives in one place. Must run on the main thread — it reads Electron's `app`,
 * which isn't available inside worker_threads; hosts call this and pass the
 * resolved path to their worker via `workerData`.
 */

import { app } from 'electron';
import * as path from 'node:path';

/** Resolve the compiled addon. Mirrors shiroani's getAddonPath dev/packaged
 *  split; the packaged path requires the electron-builder extraResources copy. */
export function getNativeAddonPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native', 'shiranami_native.node');
  }
  // __dirname is dist/main in dev; the addon lives at apps/desktop/build/Release.
  return path.join(__dirname, '../../build/Release/shiranami_native.node');
}
