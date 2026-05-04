import { net } from 'electron';
import { logger } from './logger';
import { MinIntervalGate } from './utils/min-interval-gate';

type RequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 30_000;

const RETRY_AFTER_MAX_MS = 300_000; // 5 minutes
const DEFAULT_429_BACKOFF_MS = 60_000; // 1 minute fallback when no Retry-After

/**
 * Raised when a request completes with a non-2xx status.
 * `retryAfterMs` is populated from `Retry-After` / `x-ratelimit-reset` if
 * present (clamped to 5 minutes).
 */
export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly headers: Record<string, string | string[]>,
    public readonly retryAfterMs: number | null
  ) {
    super(`Request failed with status ${status}: ${url}`);
    this.name = 'HttpError';
  }
}

/**
 * Parse a `Retry-After` header value (integer seconds or HTTP-date), falling
 * back to `x-ratelimit-reset` (epoch seconds). Returns the wait in
 * milliseconds, clamped to [0, 300_000]. Returns null when unparseable.
 */
export function parseRetryAfter(
  headers: Record<string, string | string[] | undefined>
): number | null {
  const lower: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }

  const retryAfterRaw = lower['retry-after'];
  const retryAfter = Array.isArray(retryAfterRaw) ? retryAfterRaw[0] : retryAfterRaw;
  if (typeof retryAfter === 'string' && retryAfter.trim().length > 0) {
    const trimmed = retryAfter.trim();
    // Integer seconds form.
    if (/^\d+$/.test(trimmed)) {
      const seconds = parseInt(trimmed, 10);
      if (Number.isFinite(seconds)) {
        return clampRetryAfter(seconds * 1000);
      }
    }
    // HTTP-date form.
    const asDate = Date.parse(trimmed);
    if (!Number.isNaN(asDate)) {
      return clampRetryAfter(asDate - Date.now());
    }
    // Unparseable retry-after string — fall through to x-ratelimit-reset.
  }

  const resetRaw = lower['x-ratelimit-reset'];
  const reset = Array.isArray(resetRaw) ? resetRaw[0] : resetRaw;
  if (typeof reset === 'string' && /^\d+$/.test(reset.trim())) {
    const epochSeconds = parseInt(reset.trim(), 10);
    if (Number.isFinite(epochSeconds)) {
      return clampRetryAfter(epochSeconds * 1000 - Date.now());
    }
  }

  return null;
}

function clampRetryAfter(ms: number): number | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, RETRY_AFTER_MAX_MS);
}

/**
 * Minimum spacing (ms) between requests per hostname. Hosts not listed here
 * are ungated — this is intentional for our own backend and internal flows.
 */
const HTTP_HOST_GATES: Record<string, number> = {
  'lrclib.net': 250,
  'i.ytimg.com': 100,
  'api.github.com': 1000,
  'itunes.apple.com': 500,
  'clients1.google.com': 250,
};

const gates = new Map<string, MinIntervalGate>();

function gateFor(hostname: string): MinIntervalGate | null {
  const interval = HTTP_HOST_GATES[hostname];
  if (interval === undefined) return null;
  let gate = gates.get(hostname);
  if (!gate) {
    gate = new MinIntervalGate({ minIntervalMs: interval });
    gates.set(hostname, gate);
  }
  return gate;
}

/**
 * Return (lazily create) the gate for `lrclib.net` so the lyrics service can
 * serialize its lrclib-api library calls through the same spacing rules.
 */
export function getLrclibGate(): MinIntervalGate {
  // lrclib.net is always in HTTP_HOST_GATES; the cast is safe.
  return gateFor('lrclib.net') as MinIntervalGate;
}

/**
 * Test-only: clear all gate state so each test starts from a fresh clock.
 * Exported unconditionally — callers outside tests have no reason to touch it.
 */
export function __resetGatesForTests(): void {
  gates.clear();
}

function requestTextRaw(url: string, options: RequestOptions = {}): Promise<string> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal } = options;
  const startTime = Date.now();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = net.request(url);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        request.abort();
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        request.abort();
        signal?.removeEventListener('abort', onAbort);
        logger.warn(`[http] Request timed out after ${timeout}ms: ${url}`);
        reject(new Error(`Request timed out after ${timeout}ms: ${url}`));
      }
    }, timeout);

    for (const [key, value] of Object.entries(options.headers ?? {})) {
      request.setHeader(key, value);
    }

    request.on('response', response => {
      const statusCode = response.statusCode;
      const responseHeaders = response.headers as Record<string, string | string[]>;

      if (statusCode < 200 || statusCode >= 300) {
        clearTimeout(timer);
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        logger.warn(`[http] Request failed: ${url} - status ${statusCode}`);
        reject(new HttpError(url, statusCode, responseHeaders, parseRetryAfter(responseHeaders)));
        return;
      }

      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          logger.debug(`[http] ${statusCode} ${url} (${Date.now() - startTime}ms)`);
          resolve(Buffer.concat(chunks).toString('utf-8'));
        }
      });

      response.on('error', (err: Error) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          logger.warn(`[http] Response error: ${url}`, err.message);
          reject(err);
        }
      });
    });

    request.on('error', (err: Error) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        logger.warn(`[http] Request error: ${url}`, err.message);
        reject(err);
      }
    });

    request.end();
  });
}

function requestBufferRaw(
  url: string,
  options: RequestOptions & { maxBytes?: number } = {}
): Promise<Buffer> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal } = options;
  const maxBytes = options.maxBytes;
  const startTime = Date.now();

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = net.request(url);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        request.abort();
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        request.abort();
        signal?.removeEventListener('abort', onAbort);
        logger.warn(`[http] Request timed out after ${timeout}ms: ${url}`);
        reject(new Error(`Request timed out after ${timeout}ms: ${url}`));
      }
    }, timeout);

    for (const [key, value] of Object.entries(options.headers ?? {})) {
      request.setHeader(key, value);
    }

    request.on('response', response => {
      const statusCode = response.statusCode;
      const responseHeaders = response.headers as Record<string, string | string[]>;

      if (statusCode < 200 || statusCode >= 300) {
        clearTimeout(timer);
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        logger.warn(`[http] Request failed: ${url} - status ${statusCode}`);
        reject(new HttpError(url, statusCode, responseHeaders, parseRetryAfter(responseHeaders)));
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        totalSize += chunk.length;
        if (maxBytes !== undefined && totalSize > maxBytes) {
          clearTimeout(timer);
          settled = true;
          request.abort();
          signal?.removeEventListener('abort', onAbort);
          reject(new Error(`Response exceeded maxBytes (${maxBytes}): ${url}`));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          logger.debug(`[http] ${statusCode} ${url} (${Date.now() - startTime}ms)`);
          resolve(Buffer.concat(chunks));
        }
      });

      response.on('error', (err: Error) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          logger.warn(`[http] Response error: ${url}`, err.message);
          reject(err);
        }
      });
    });

    request.on('error', (err: Error) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        logger.warn(`[http] Request error: ${url}`, err.message);
        reject(err);
      }
    });

    request.end();
  });
}

/**
 * Apply the per-host gate to `op`. On a 429 from that host, extend the gate
 * by the server's Retry-After (or a 60s fallback) before rethrowing — the
 * caller still gets the rejection, we just don't hammer the host further.
 */
function runGated<T>(url: string, op: () => Promise<T>): Promise<T> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Malformed URL — let the raw call fail naturally with a clearer message.
    return op();
  }
  const gate = gateFor(hostname);
  if (!gate) return op();

  return gate.run(async () => {
    try {
      return await op();
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        const retry = err.retryAfterMs ?? DEFAULT_429_BACKOFF_MS;
        logger.warn(`[http] 429 from ${hostname}, backing off ${retry}ms`);
        gate.bumpBy(retry);
      }
      throw err;
    }
  });
}

export function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  return runGated(url, () => requestTextRaw(url, options));
}

export function requestBuffer(
  url: string,
  options: RequestOptions & { maxBytes?: number } = {}
): Promise<Buffer> {
  return runGated(url, () => requestBufferRaw(url, options));
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const text = await requestText(url, options);
  return JSON.parse(text) as T;
}
