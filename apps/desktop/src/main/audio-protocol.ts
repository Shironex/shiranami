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
      // The file path is everything after the host, URL-decoded
      const filePath = decodeURIComponent(url.pathname).replace(/^\//, '');

      // On Windows, paths come through as /C:/Users/... — strip the leading slash
      const normalizedPath =
        process.platform === 'win32' && /^\/[a-zA-Z]:/.test('/' + filePath)
          ? filePath
          : filePath;

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
          return new Response('Not a file', { status: 403 });
        }
      } catch {
        return new Response('Not found', { status: 404 });
      }

      // Use net.fetch with file:// to stream the file through Electron's network stack
      return net.fetch(`file:///${normalizedPath.replace(/\\/g, '/')}`);
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
  return `shiranami-audio://play/${encodeURIComponent(normalized)}`;
}
