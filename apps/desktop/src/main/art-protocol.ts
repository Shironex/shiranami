import { app, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';

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

/** Map MIME type to file extension */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
  };
  return map[mime] || '.jpg';
}

/** Map file extension to MIME type */
function extToMime(ext: string): string {
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

/**
 * Save album art image data to disk.
 * Returns the protocol URL (shiranami-art://art/{hash}{ext}) or null if data is empty.
 */
export async function saveAlbumArt(data: Buffer, mimeType: string): Promise<string | null> {
  if (!data || data.length === 0) return null;

  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
  const ext = mimeToExt(mimeType);
  const fileName = `${hash}${ext}`;
  const filePath = path.join(getArtDir(), fileName);

  try {
    // Atomically write the file if it doesn't exist using the 'wx' flag.
    await fs.promises.writeFile(filePath, data, { flag: 'wx' });
  } catch (error: any) {
    // If the file already exists ('EEXIST'), it's not an error for content-addressing.
    if (error.code !== 'EEXIST') {
      logger.error(`[art-protocol] Failed to save album art ${fileName}:`, error);
      throw error;
    }
  }

  return toArtUrl(fileName);
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

      const contentType = extToMime(ext);
      const data = await fs.promises.readFile(filePath);

      return new Response(data, {
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
