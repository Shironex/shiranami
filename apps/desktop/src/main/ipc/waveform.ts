import { app, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WaveformPeaksResult } from '@shiranami/contracts';
import { IPC_CHANNELS, WAVEFORM_PEAK_COUNT } from '@shiranami/contracts';
import { handle } from './with-ipc-handler';
import { logger } from '../logger';
import { hashTrackKey, readCachedPeaks, writeCachedPeaks } from '../lib/waveform-cache';
import { decodeWaveformPeaks, shutdownWaveformWorker } from '../waveform-host';
import { waveformGetPeaksArgs } from './schemas/waveform';

const C = IPC_CHANNELS.waveform;

let peaksDir = '';
function getPeaksDir(): string {
  if (!peaksDir) peaksDir = path.join(app.getPath('userData'), 'waveform-peaks');
  return peaksDir;
}

function ensurePeaksDir(): void {
  const dir = getPeaksDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Coalesce concurrent requests for the same track (the player can ask twice as
 * a track changes) so we decode each file at most once even if two requests
 * arrive before the first resolves. Keyed by the content hash.
 */
const inFlight = new Map<string, Promise<WaveformPeaksResult | null>>();

export function registerWaveformHandlers(): void {
  ensurePeaksDir();

  handle(
    C.getPeaks,
    async (_event, filePath: string): Promise<WaveformPeaksResult | null> => {
      // Stat the file for both existence and the cache key. A missing file
      // (deleted, unplugged drive, radio stream) simply has no waveform.
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) return null;
      } catch {
        return null;
      }

      const hash = hashTrackKey(filePath, stat.mtimeMs, stat.size);

      // Fast path: served from the on-disk cache (decoded on a previous play).
      const cached = await readCachedPeaks(getPeaksDir(), hash);
      if (cached) return { peaks: cached };

      const existing = inFlight.get(hash);
      if (existing) return existing;

      const job = (async (): Promise<WaveformPeaksResult | null> => {
        const peaks = await decodeWaveformPeaks(filePath, WAVEFORM_PEAK_COUNT);
        if (!peaks) return null; // unsupported format or decode failure
        await writeCachedPeaks(getPeaksDir(), hash, peaks).catch(err =>
          logger.warn('[waveform] cache write failed:', err)
        );
        return { peaks };
      })().finally(() => inFlight.delete(hash));

      inFlight.set(hash, job);
      return job;
    },
    { schema: waveformGetPeaksArgs }
  );
}

export function cleanupWaveformHandlers(): void {
  ipcMain.removeHandler(C.getPeaks);
  shutdownWaveformWorker();
  inFlight.clear();
}
