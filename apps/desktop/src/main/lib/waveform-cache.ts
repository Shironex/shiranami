// Content-addressed disk cache for waveform peaks.
//
// Mirrors the album-art cache convention (art-protocol.ts): a SHA-256 of the
// track's identity, truncated to 128 bits, names a small JSON file. The
// identity is `path + mtime + size`, so replacing or re-encoding a file at the
// same path produces a different key and a fresh waveform — stale peaks never
// survive an edit.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Stable cache key for a track's waveform. */
export function hashTrackKey(filePath: string, mtimeMs: number, size: number): string {
  return crypto
    .createHash('sha256')
    .update(`${filePath}|${Math.round(mtimeMs)}|${size}`)
    .digest('hex')
    .slice(0, 32);
}

/** Read cached peaks for a key, or null on miss / unreadable / malformed file. */
export async function readCachedPeaks(dir: string, hash: string): Promise<number[] | null> {
  try {
    const raw = await fs.promises.readFile(path.join(dir, `${hash}.json`), 'utf-8');
    const parsed = JSON.parse(raw) as { peaks?: unknown };
    // Guard against a corrupted/tampered file: Array.isArray alone would let a
    // string array through typed as number[] and break canvas rendering.
    if (!Array.isArray(parsed.peaks)) return null;
    if (!parsed.peaks.every((p): p is number => typeof p === 'number')) return null;
    return parsed.peaks;
  } catch {
    return null;
  }
}

/**
 * Write peaks for a key. Uses the `wx` flag (write, fail if exists) so a
 * concurrent writer racing on the same content-addressed name is a harmless
 * EEXIST rather than a torn file — identical to the album-art write.
 */
export async function writeCachedPeaks(dir: string, hash: string, peaks: number[]): Promise<void> {
  const file = path.join(dir, `${hash}.json`);
  try {
    await fs.promises.writeFile(file, JSON.stringify({ peaks }), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
  }
}
