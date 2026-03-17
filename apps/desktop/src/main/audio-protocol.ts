import { protocol, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

/** Audio file extensions we allow serving */
const ALLOWED_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.opus',
  '.wma',
  '.weba',
  '.webm',
]);

/**
 * Register the shiranami-audio: protocol for streaming local audio files.
 * URLs have the format: shiranami-audio://play/<encoded-file-path>
 *
 * Must be called after app.ready (inside bootstrap).
 */
export function registerAudioProtocol(): void {
  protocol.handle('shiranami-audio', async request => {
    try {
      const url = new URL(request.url);
      // File path is passed as ?path= query parameter to avoid URL encoding issues
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        logger.warn('[audio-protocol] Missing path parameter');
        return new Response('Bad request', { status: 400 });
      }

      const normalizedPath = filePath;

      logger.debug(`[audio-protocol] Request for: ${normalizedPath}`);

      // Security: validate extension
      const ext = path.extname(normalizedPath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        logger.warn(`[audio-protocol] Blocked non-audio extension: ${ext}`);
        return new Response('Forbidden', { status: 403 });
      }

      // Security: verify file exists and is a file (not directory/symlink to sensitive path)
      try {
        const stat = await fs.promises.stat(normalizedPath);
        if (!stat.isFile()) {
          logger.warn(`[audio-protocol] Not a file: ${normalizedPath}`);
          return new Response('Not a file', { status: 403 });
        }
      } catch (err) {
        logger.warn(`[audio-protocol] File not found: ${normalizedPath}`, err);
        return new Response('Not found', { status: 404 });
      }

      // Convert to a proper file:// URL using pathToFileURL for correct encoding
      const { pathToFileURL } = await import('url');
      const fileUrl = pathToFileURL(normalizedPath).href;
      return net.fetch(fileUrl);
    } catch (error) {
      logger.error('[audio-protocol] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('Audio protocol registered');
}

/**
 * Convert a local file path to a shiranami-audio:// URL
 */
export function toAudioUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return `shiranami-audio://play?path=${encodeURIComponent(normalized)}`;
}
