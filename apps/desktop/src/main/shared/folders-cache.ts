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
 * build time. `isPathAllowed` additionally calls `fs.promises.realpath` on
 * the requested path before the containment check, so a symlink inside an
 * allowed root that points outside is rejected — important because the
 * audio-protocol's downstream `fs.stat` and `createReadStream` follow
 * symlinks, so a textual containment check alone could be bypassed.
 */

let cachedRoots: string[] | null = null;

/**
 * Bounded set of raw `filePath` inputs that have already passed `isPathAllowed`.
 * Every `shiranami-audio://` Range request during a seek re-runs `isPathAllowed`
 * for the same file, paying a `fs.promises.realpath` (and, for standalone
 * imports, a SQLite lookup) each time. Caching the positive result lets repeat
 * checks short-circuit before either I/O hit.
 *
 * Keyed on the raw input — the audio protocol issues a stable URL per file —
 * so a hit skips realpath entirely. Only positive authorizations are stored;
 * negatives are never cached (a denied path must stay denied only until the
 * allowed-root set actually changes, which `invalidate()` signals). The set is
 * cleared by `invalidate()` alongside the roots, so removing a folder or
 * changing the download location drops any now-stale grants.
 */
const ALLOWED_PATHS_LIMIT = 1024;
const allowedPaths = new Set<string>();

function rememberAllowed(filePath: string): void {
  // Refresh recency on re-grant so the bounded set evicts least-recently-used.
  allowedPaths.delete(filePath);
  allowedPaths.add(filePath);
  if (allowedPaths.size > ALLOWED_PATHS_LIMIT) {
    const oldest = allowedPaths.values().next().value;
    if (oldest !== undefined) allowedPaths.delete(oldest);
  }
}

/**
 * Drop the cached allowed-roots set and the positive-authorization cache. The
 * next call to `getAllowedRoots()` (or `isPathAllowed`) will rebuild the roots
 * from `app.getPath`, the store, and the folders table, and re-authorize each
 * path from scratch.
 */
export function invalidate(): void {
  cachedRoots = null;
  allowedPaths.clear();
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
    return db
      .select({ path: folders.path })
      .from(folders)
      .all()
      .map(r => r.path);
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
    logger.warn(`[folders-cache] realpath failed for "${candidate}", using as-is`, err);
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
 *   1. Resolve symlinks and confirm containment within an allowed root. The
 *      audio protocol's downstream `fs.stat` and `createReadStream` follow
 *      symlinks, so we must too — otherwise a symlink inside an allowed root
 *      pointing at `/etc/passwd` would pass a textual containment check.
 *   2. Tracks-fallback: a row exists in `tracks` matching the requested
 *      path. Covers standalone imports via `dialog:open-file` whose location
 *      is outside any folder root. Looked up with `path.resolve(filePath)`
 *      so forward-slash inputs from URL params (`toAudioUrl` always uses
 *      `/`) hit the row stored with native separators on Windows.
 *
 * Fails closed if the database is unavailable.
 */
export async function isPathAllowed(filePath: string): Promise<boolean> {
  if (!filePath) return false;

  // Fast path: this exact input already authorized since the last invalidate().
  // Skips the realpath + (standalone-import) SQLite round-trips on every Range
  // request of a seek. Cleared by invalidate() so it can never outlive a change
  // to the allowed-root set.
  if (allowedPaths.has(filePath)) return true;

  // realpath swallows ENOENT/EACCES — fall back to the textual path; the
  // downstream stat will surface the real error to the renderer.
  const resolved = await fs.promises.realpath(filePath).catch(() => filePath);

  if (isPathWithinAny(resolved, getAllowedRoots())) {
    rememberAllowed(filePath);
    return true;
  }

  try {
    const db = getDatabase();
    const dbKey = path.resolve(filePath);
    const row = db
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.filePath, dbKey))
      .limit(1)
      .get();
    if (row) {
      rememberAllowed(filePath);
      return true;
    }
    // Negative result — never cached; a path can become allowed later (import).
    return false;
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
