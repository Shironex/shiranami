import { net, protocol } from 'electron';
import { logger } from './logger';
import { isStreamUrlAllowed } from './shared/url-safety';
import { userAgent } from './shared/user-agent';
import { DEFAULT_AUDIO_MIME } from './shared/media-types';

/**
 * Maximum redirect hops we will follow before giving up. Each hop's
 * `Location` is re-validated through `isStreamUrlAllowed`, otherwise the SSRF
 * guard would be trivially bypassed via `https://attacker/ -> http://10.0.0.1/`.
 *
 * yt-dlp googlevideo URLs and some shoutcast clusters legitimately redirect
 * once or twice, so we leave headroom but stop well below `net.fetch`'s
 * default of 20.
 */
const MAX_REDIRECTS = 5;

/** HTTP statuses that carry a Location header we should follow. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Generic 403 response handed back to the renderer on any guard rejection.
 * The reason is logged main-side at `warn` — never include it in the body
 * (info leak: lets a malicious page probe internal resolution).
 */
function forbidden(): Response {
  return new Response('Forbidden', { status: 403 });
}

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
  protocol.handle('shiranami-radio', async request => {
    try {
      const parsed = new URL(request.url);
      const streamUrl = parsed.searchParams.get('url');

      if (!streamUrl) {
        logger.warn('[radio-protocol] Missing url parameter');
        return new Response('Bad request: missing url parameter', { status: 400 });
      }

      // SSRF guard — reject before any network I/O if the renderer-supplied
      // URL points at a private / reserved address. See `shared/url-safety.ts`.
      const initialGuard = await isStreamUrlAllowed(streamUrl);
      if (!initialGuard.ok) {
        logger.warn(`[radio-protocol] blocked URL (${initialGuard.reason}): ${streamUrl}`);
        return forbidden();
      }

      logger.debug(`[radio-protocol] Proxying stream: ${streamUrl}`);

      // Manual redirect handling — follow up to MAX_REDIRECTS hops, running
      // every Location through the same guard. If we delegated to net.fetch's
      // built-in follower, an attacker could 302 us into a private address.
      let currentUrl = initialGuard.url.toString();
      let response: Response | null = null;

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        response = await net.fetch(currentUrl, {
          headers: {
            'User-Agent': userAgent(),
            'Icy-MetaData': '0',
          },
          signal: request.signal,
          redirect: 'manual',
        });

        if (!REDIRECT_STATUSES.has(response.status)) break;

        const location = response.headers.get('location');
        if (!location) break;

        if (hop === MAX_REDIRECTS) {
          logger.warn(
            `[radio-protocol] redirect chain exceeded ${MAX_REDIRECTS} hops, last URL: ${currentUrl}`
          );
          return forbidden();
        }

        // Resolve relative redirects against the current absolute URL.
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          logger.warn(
            `[radio-protocol] invalid Location header on redirect from ${currentUrl}: ${location}`
          );
          return forbidden();
        }

        const hopGuard = await isStreamUrlAllowed(nextUrl);
        if (!hopGuard.ok) {
          logger.warn(
            `[radio-protocol] blocked redirect (${hopGuard.reason}) from ${currentUrl} -> ${nextUrl}`
          );
          return forbidden();
        }

        currentUrl = hopGuard.url.toString();
      }

      // Loop guarantees `response` is set (we always assign before any break /
      // return), but TS can't narrow that — assert and continue.
      if (!response) {
        logger.error('[radio-protocol] internal: redirect loop produced no response');
        return new Response('Internal error', { status: 500 });
      }

      if (!response.ok) {
        logger.warn(`[radio-protocol] Upstream returned ${response.status} for: ${currentUrl}`);
        return new Response(`Upstream error: ${response.status}`, { status: response.status });
      }

      // Forward the response with appropriate headers
      const headers = new Headers();
      const contentType = response.headers.get('content-type');
      if (contentType) {
        headers.set('Content-Type', contentType);
      } else {
        // Default to audio/mpeg for radio streams
        headers.set('Content-Type', DEFAULT_AUDIO_MIME);
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
