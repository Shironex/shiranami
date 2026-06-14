import { protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../app/logger';
import { isPathAllowed } from '../shared/folders-cache';
import { AUDIO_EXTENSIONS, audioMime } from '../shared/media-types';

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

      logger.debug(`[audio-protocol] Request for: ${filePath}`);

      // Security: validate extension
      const ext = path.extname(filePath).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(ext)) {
        logger.warn(`[audio-protocol] Blocked non-audio extension: ${ext}`);
        return new Response('Forbidden', { status: 403 });
      }

      // Security: containment — reject paths outside allowed roots/known tracks.
      if (!(await isPathAllowed(filePath))) {
        logger.warn(`[audio-protocol] blocked path outside allowed roots: ${filePath}`);
        return new Response('Forbidden', { status: 403 });
      }

      // Security: verify file exists and is a file (not directory/symlink to sensitive path)
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) {
          logger.warn(`[audio-protocol] Not a file: ${filePath}`);
          return new Response('Not a file', { status: 403 });
        }
      } catch (err) {
        logger.warn(`[audio-protocol] File not found: ${filePath}`, err);
        return new Response('Not found', { status: 404 });
      }

      // Handle Range requests for seeking support
      const fileSize = stat.size;
      const contentType = audioMime(ext);
      const rangeHeader = request.headers.get('Range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          const stream = fs.createReadStream(filePath, { start, end });
          const readable = new ReadableStream({
            start(controller) {
              stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
              stream.on('end', () => controller.close());
              stream.on('error', err => controller.error(err));
            },
            cancel() {
              stream.destroy();
            },
          });

          return new Response(readable as unknown as ReadableStream, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Content-Length': String(chunkSize),
              'Accept-Ranges': 'bytes',
            },
          });
        }
      }

      // No Range header — return full file
      const stream = fs.createReadStream(filePath);
      const readable = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
          stream.on('end', () => controller.close());
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
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        },
      });
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
