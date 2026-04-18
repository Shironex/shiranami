import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { folders, tracks, eq } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { logger } from '../logger';
import { store } from '../store';
import { isPathWithinAny, normalizePathForCompare } from './path-safety';

/**
 * Cache of allowed filesystem roots used by the path-containment guards.
 *
 * The cache is rebuilt lazily on first access and held until `invalidate()`
 * is called. Mutating IPC handlers that change the set of allowed roots
 * (`db:folders:add`, `db:folders:remove`, `downloader:set-download-location`)
 * are responsible for calling `invalidate()` after a successful write.
 *
 * Roots include:
 *   - `app.getPath('userData')` — covers the on-disk album-art cache and
 *     anything else stored under userData that the renderer may legitimately
 *     reference.
 *   - The active downloads location: either `store.get('downloads.location')`
 *     when set, or the default `<music>/Shiranami Downloads` directory.
 *   - Every row in the `folders` table (the user's watched library roots).
 *
 * Tracks-fallback in `isPathAllowed` covers a fourth case: standalone files
 * imported via `dialog:open-file` legitimately live outside any registered
 * root, so any `tracks.file_path` row is also accepted. This deliberately
 * means that `db:folders:remove` does NOT immediately revoke shell access
 * to tracks under the removed folder — the tracks remain in the DB until
 * the user removes them explicitly.
 *
 * Symlinks: `fs.realpathSync` is called once per registered root at cache
 * build time, but `isPathAllowed` does NOT realpath each request. See
 * `path-safety.ts` for the full caveat.
 */

let cachedRoots: string[] | null = null;

/**
 * Drop the cached allowed-roots set. The next call to `getAllowedRoots()`
 * (or `isPathAllowed`) will rebuild it from `app.getPath`, the store, and
 * the folders table.
 */
export function invalidate(): void {
  cachedRoots = null;
}

function getDefaultDownloadDir(): string {
  return path.join(app.getPath('music'), 'Shiranami Downloads');
}

function getConfiguredDownloadDir(): string {
  const stored = store.get('downloads.location');
  if (typeof stored !== 'string') return getDefaultDownloadDir();
  const trimmed = stored.trim();
  return trimmed.length > 0 ? trimmed : getDefaultDownloadDir();
}

function readFolderPaths(): string[] {
  try {
    const db = getDatabase();
    return db.select({ path: folders.path }).from(folders).all().map(r => r.path);
  } catch (err) {
    logger.warn('[folders-cache] folders table read failed; continuing without folder roots', err);
    return [];
  }
}

/**
 * Resolve the symlink target for a candidate root if possible. Falls back to
 * the original path if the root doesn't exist yet (first launch, freshly
 * configured download dir, etc.) — we still want to allow paths beneath it
 * once it gets created.
 */
function resolveRootSafely(candidate: string): string {
  try {
    return fs.realpathSync(candidate);
  } catch (err) {
    logger.warn(
      `[folders-cache] realpath failed for "${candidate}", using as-is`,
      err,
    );
    return candidate;
  }
}

/**
 * Build (or return cached) list of normalized allowed roots. Synchronous —
 * the underlying DB read is cached and the realpath calls are bounded by
 * the number of registered roots (typically O(10)).
 */
export function getAllowedRoots(): string[] {
  if (cachedRoots) return cachedRoots;

  const candidates: string[] = [
    app.getPath('userData'),
    getConfiguredDownloadDir(),
    ...readFolderPaths(),
  ];

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = resolveRootSafely(candidate);
    const key = normalizePathForCompare(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  cachedRoots = normalized;
  return cachedRoots;
}

/**
 * Return `true` when `filePath` is safe to expose via shell or audio handlers.
 *
 * Two-step check:
 *   1. Containment within any allowed root (the common case).
 *   2. Tracks-fallback: a row exists in `tracks` with the original
 *      (un-normalized) `file_path`. Covers standalone imports via
 *      `dialog:open-file` whose location is outside any folder root.
 *
 * Fails closed if the database is unavailable.
 */
export async function isPathAllowed(filePath: string): Promise<boolean> {
  if (!filePath) return false;

  if (isPathWithinAny(filePath, getAllowedRoots())) {
    return true;
  }

  // Fallback — query tracks.file_path with the path as the renderer stored
  // it. We deliberately use the original (un-normalized) string because the
  // column is stored verbatim from the import path.
  try {
    const db = getDatabase();
    const row = db
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.filePath, filePath))
      .limit(1)
      .get();
    return !!row;
  } catch (err) {
    logger.warn('[folders-cache] tracks lookup failed; denying path (fail-closed)', err);
    return false;
  }
}

/**
 * Build the cache eagerly. Called from main bootstrap after the database is
 * initialized so the first user-triggered request doesn't pay the build cost.
 */
export function prewarm(): void {
  getAllowedRoots();
}
