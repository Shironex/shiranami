import { net, protocol } from 'electron';
import { logger } from './logger';

/**
 * Register the shiranami-radio: protocol for proxying internet radio streams.
 * URLs have the format: shiranami-radio://stream?url=<encoded-stream-url>
 *
 * This solves the mixed-content problem where HTTP radio streams would be
 * blocked by Chromium's secure context policy.
 *
 * Must be called after app.ready (inside bootstrap).
 */
export function registerRadioProtocol(): void {
  protocol.handle('shiranami-radio', async (request) => {
    try {
      const parsed = new URL(request.url);
      const streamUrl = parsed.searchParams.get('url');

      if (!streamUrl) {
        logger.warn('[radio-protocol] Missing url parameter');
        return new Response('Bad request: missing url parameter', { status: 400 });
      }

      logger.debug(`[radio-protocol] Proxying stream: ${streamUrl}`);

      // Use Electron's net module to fetch the stream - it bypasses CORS
      // and handles HTTP properly from the main process
      const response = await net.fetch(streamUrl, {
        headers: {
          'User-Agent': 'Shiranami/0.2.1',
          'Icy-MetaData': '0',
        },
        signal: request.signal,
      });

      if (!response.ok) {
        logger.warn(`[radio-protocol] Upstream returned ${response.status} for: ${streamUrl}`);
        return new Response(`Upstream error: ${response.status}`, { status: response.status });
      }

      // Forward the response with appropriate headers
      const headers = new Headers();
      const contentType = response.headers.get('content-type');
      if (contentType) {
        headers.set('Content-Type', contentType);
      } else {
        // Default to audio/mpeg for radio streams
        headers.set('Content-Type', 'audio/mpeg');
      }
      headers.set('Accept-Ranges', 'none');
      headers.set('Cache-Control', 'no-cache, no-store');

      return new Response(response.body, {
        status: 200,
        headers,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stream was cancelled (user stopped playback) - this is normal
        return new Response('Aborted', { status: 499 });
      }
      logger.error('[radio-protocol] Error proxying stream:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('Radio protocol registered');
}
