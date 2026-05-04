import { app, protocol, nativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';
import { tracks } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';

/** Directory where extracted album art images are stored */
let artDir: string;

function getArtDir(): string {
  if (!artDir) {
    artDir = path.join(app.getPath('userData'), 'album-art');
  }
  return artDir;
}

/** Ensure the album-art directory exists (call once at startup) */
export function ensureArtDir(): void {
  const dir = getArtDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created album-art directory: ${dir}`);
  }
}

/** Map file extension to MIME type */
export function extToMime(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  };
  return map[ext] || 'image/jpeg';
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

const MAX_DIMENSION = 512;

/**
 * Downscale a decoded nativeImage to fit within MAX_DIMENSION on its longest edge,
 * re-encoding as JPEG q=85. Skips the resize step when both dimensions are already
 * within the limit; always re-encodes to normalise the output format.
 */
export function downscaleImage(image: Electron.NativeImage): Buffer {
  const { width, height } = image.getSize();
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return image.toJPEG(85);
  }

  const scale = MAX_DIMENSION / Math.max(width, height);
  // Floor at 1px so extreme aspect ratios (e.g. 10000×1) can't round to 0.
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const resized = image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
  return resized.toJPEG(85);
}

/** Whether we have logged the first cache-write info line this session. */
let _firstWriteLogged = false;

/**
 * Save album art image data to disk.
 * Returns the protocol URL (shiranami-art://art/{hash}.jpg) or null if data is empty.
 */
export async function saveAlbumArt(data: Buffer, _mimeType: string): Promise<string | null> {
  if (!data || data.length === 0) return null;

  const image = nativeImage.createFromBuffer(data);
  if (image.isEmpty()) return null;

  const resized = downscaleImage(image);

  const hash = crypto.createHash('sha256').update(resized).digest('hex').slice(0, 32);
  const fileName = `${hash}.jpg`;
  const filePath = path.join(getArtDir(), fileName);

  try {
    // Atomically write the file if it doesn't exist using the 'wx' flag.
    await fs.promises.writeFile(filePath, resized, { flag: 'wx' });
    if (!_firstWriteLogged) {
      _firstWriteLogged = true;
      logger.info('[art-protocol] Writing downscaled album art (512px JPEG) to cache');
    }
  } catch (error: unknown) {
    // If the file already exists ('EEXIST'), it's not an error for content-addressing.
    if (error instanceof Error && (error as NodeJS.ErrnoException).code !== 'EEXIST') {
      logger.error(`[art-protocol] Failed to save album art ${fileName}:`, error);
      throw error;
    }
  }

  return toArtUrl(fileName);
}

/** Reset the first-write log flag (for testing only). */
export function _resetFirstWriteLoggedForTest(): void {
  _firstWriteLogged = false;
}

/** Reset the memoized art directory (for testing only). */
export function _resetArtDirForTest(): void {
  artDir = '';
}

// ---------------------------------------------------------------------------
// In-process LRU for hot art bytes. Sized to ~5 MB by tracking total Buffer
// length on insert; eviction is least-recently-used (Map preserves insertion
// order; we delete + re-set on hit to promote).
// Same shape as lyrics-service.ts.
// ---------------------------------------------------------------------------

const ART_LRU_MAX_BYTES = 5 * 1024 * 1024;
const artLruCache = new Map<string, Buffer>();
let artLruBytes = 0;

function artLruGet(fileName: string): Buffer | undefined {
  const value = artLruCache.get(fileName);
  if (value !== undefined) {
    artLruCache.delete(fileName);
    artLruCache.set(fileName, value);
  }
  return value;
}

function artLruSet(fileName: string, data: Buffer): void {
  const existing = artLruCache.get(fileName);
  if (existing) {
    artLruBytes -= existing.length;
    artLruCache.delete(fileName);
  }
  // Skip pathologically large entries — at 512px JPEG q=85 a single file is
  // ~30-80 KB so anything over the cap is anomalous and would force-evict
  // the entire cache for one entry.
  if (data.length > ART_LRU_MAX_BYTES) return;
  while (artLruBytes + data.length > ART_LRU_MAX_BYTES && artLruCache.size > 0) {
    const oldest = artLruCache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = artLruCache.get(oldest);
    artLruCache.delete(oldest);
    if (evicted) artLruBytes -= evicted.length;
  }
  artLruCache.set(fileName, data);
  artLruBytes += data.length;
}

/** Reset the in-process LRU (testing only). */
export function _resetArtLruForTest(): void {
  artLruCache.clear();
  artLruBytes = 0;
}

// ---------------------------------------------------------------------------
// Orphan pruning — diff DB-referenced files vs disk; delete files no longer
// referenced. Pure additive: never deletes anything still in tracks.albumArt.
// ---------------------------------------------------------------------------

/**
 * Extract the bare file name from a shiranami-art:// URL. Returns null for
 * any other URL shape (data:, file:, http:, …) or invalid input — the caller
 * uses this to skip non-disk-cache rows when computing the referenced set.
 */
export function artFileNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = 'shiranami-art://';
  if (!url.startsWith(prefix)) return null;
  try {
    const parsed = new URL(url);
    const name = path.basename(parsed.pathname.replace(/^\/+/, ''));
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Delete on-disk album-art files that no `tracks.albumArt` row references.
 *
 * Returns counts so callers can log progress; never throws — readdir errors
 * (missing dir, perms) are logged and the function exits cleanly so it is
 * safe to call from app boot fire-and-forget.
 */
export async function pruneOrphanedAlbumArt(): Promise<{
  scanned: number;
  deleted: number;
  referenced: number;
}> {
  const dir = getArtDir();

  const referenced = new Set<string>();
  try {
    const db = getDatabase();
    const rows = db.selectDistinct({ albumArt: tracks.albumArt }).from(tracks).all();
    for (const row of rows) {
      const name = artFileNameFromUrl(row.albumArt);
      if (name) referenced.add(name);
    }
  } catch (error) {
    logger.warn('[art-protocol] prune: DB query failed, skipping prune:', error);
    return { scanned: 0, deleted: 0, referenced: 0 };
  }

  let entries: string[];
  try {
    entries = await fs.promises.readdir(dir);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return { scanned: 0, deleted: 0, referenced: referenced.size };
    }
    logger.warn('[art-protocol] prune: readdir failed:', error);
    return { scanned: 0, deleted: 0, referenced: referenced.size };
  }

  let deleted = 0;
  for (const entry of entries) {
    if (referenced.has(entry)) continue;
    const ext = path.extname(entry).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    const filePath = path.join(dir, entry);
    try {
      await fs.promises.unlink(filePath);
      // Drop any LRU entry too — we just deleted the source of truth.
      const cached = artLruCache.get(entry);
      if (cached) {
        artLruBytes -= cached.length;
        artLruCache.delete(entry);
      }
      deleted += 1;
    } catch (error) {
      logger.warn(`[art-protocol] prune: failed to delete ${entry}:`, error);
    }
  }

  if (deleted > 0) {
    logger.info(
      `[art-protocol] prune: deleted ${deleted} orphan(s) (referenced=${referenced.size}, scanned=${entries.length})`
    );
  }
  return { scanned: entries.length, deleted, referenced: referenced.size };
}

/**
 * Convert a filename to a shiranami-art:// URL
 */
export function toArtUrl(fileName: string): string {
  return `shiranami-art://art/${fileName}`;
}

/**
 * Register the shiranami-art: protocol for serving album art images.
 * Must be called after app.ready.
 */
export function registerArtProtocol(): void {
  ensureArtDir();

  protocol.handle('shiranami-art', async request => {
    try {
      const url = new URL(request.url);
      // URL format: shiranami-art://art/{hash}.{ext}
      const fileName = url.pathname.replace(/^\/+/, '');

      if (!fileName) {
        return new Response('Bad request', { status: 400 });
      }

      // Security: validate extension
      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        logger.warn(`[art-protocol] Blocked non-image extension: ${ext}`);
        return new Response('Forbidden', { status: 403 });
      }

      // Security: prevent path traversal
      const safeName = path.basename(fileName);
      const contentType = extToMime(ext);

      // Hot path: serve from in-process LRU when available. Hits avoid the
      // disk I/O + Buffer allocation entirely when Chromium re-fetches the
      // same cover (drag-scroll, viewport churn, etc.).
      const cached = artLruGet(safeName);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(cached.length),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      const filePath = path.join(getArtDir(), safeName);

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) {
          return new Response('Not a file', { status: 403 });
        }
      } catch {
        return new Response('Not found', { status: 404 });
      }

      // Stream the file rather than reading it into a Buffer up-front. Same
      // pattern as audio-protocol.ts — Chromium pulls chunks lazily, so main
      // never holds the full file in a JS Buffer that would be copied a
      // second time when Electron serialises the Response body across the
      // IPC bridge. We tee the chunks into the LRU as they pass through so
      // subsequent hits stay synchronous.
      const stream = fs.createReadStream(filePath);
      const chunks: Buffer[] = [];
      const readable = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            controller.enqueue(chunk);
          });
          stream.on('end', () => {
            controller.close();
            // Concat once at end; for ~30-80 KB JPEGs this is a single small
            // allocation. LRU is bytes-bounded so oversized inputs are
            // dropped inside artLruSet.
            artLruSet(safeName, Buffer.concat(chunks));
          });
          stream.on('error', err => controller.error(err));
        },
        cancel() {
          stream.destroy();
        },
      });

      return new Response(readable as unknown as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error) {
      logger.error('[art-protocol] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('Art protocol registered');
}
