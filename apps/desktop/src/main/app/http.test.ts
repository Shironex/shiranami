import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/* ---------------------------------------------------------------- */
/*  electron.net.request stub — modelled after ipc/share.test.ts.    */
/*                                                                    */
/*  Each call to `net.request(url)` pops the next `responseQueue`     */
/*  entry for that URL's host (or uses a global default). The stub    */
/*  fires `response` → `data` → `end` asynchronously via setImmediate */
/*  so Electron's real async surface is preserved.                    */
/* ---------------------------------------------------------------- */

type FakeResponse = {
  statusCode: number;
  headers?: Record<string, string | string[]>;
  body?: string;
};

type NetCall = { url: string; time: number };

const netCalls: NetCall[] = [];
const responsesByHost = new Map<string, FakeResponse[]>();
let defaultResponse: FakeResponse = { statusCode: 200, body: 'ok' };

function queueResponse(hostname: string, response: FakeResponse): void {
  const list = responsesByHost.get(hostname) ?? [];
  list.push(response);
  responsesByHost.set(hostname, list);
}

function popResponse(hostname: string): FakeResponse {
  const list = responsesByHost.get(hostname);
  if (list && list.length > 0) {
    return list.shift()!;
  }
  return defaultResponse;
}

vi.mock('electron', () => ({
  net: {
    request: vi.fn((url: string) => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const hostname = new URL(url).hostname;
      netCalls.push({ url, time: Date.now() });
      return {
        setHeader: vi.fn(),
        abort: vi.fn(),
        on(event: string, cb: (...args: unknown[]) => void) {
          handlers[event] = cb;
        },
        end() {
          const response = popResponse(hostname);
          // Simulate async response flow. We use setTimeout (not
          // setImmediate) so that vi.advanceTimersByTimeAsync flushes
          // the response callback — setImmediate is not a timer API
          // and is not controlled by fake timers.
          setTimeout(() => {
            const responseHandlers: Record<string, (...args: unknown[]) => void> = {};
            handlers['response']?.({
              statusCode: response.statusCode,
              headers: response.headers ?? {},
              on(event: string, cb: (...args: unknown[]) => void) {
                responseHandlers[event] = cb;
              },
            });
            if (response.statusCode >= 200 && response.statusCode < 300) {
              responseHandlers['data']?.(Buffer.from(response.body ?? ''));
              responseHandlers['end']?.();
            }
          }, 0);
        },
      };
    }),
  },
}));

import { parseRetryAfter, HttpError, requestText, __resetGatesForTests } from './http';

/* ---------------------------------------------------------------- */
/*  Helper: advance fake timers until `netCalls` reaches a target    */
/*  length OR the current promise settles. Vitest's                  */
/*  advanceTimersByTimeAsync also flushes microtasks, so setImmediate*/
/*  callbacks fire in order.                                         */
/* ---------------------------------------------------------------- */

async function waitForNetCalls(target: number, timeoutMs = 120_000): Promise<void> {
  let elapsed = 0;
  while (netCalls.length < target && elapsed < timeoutMs) {
    await vi.advanceTimersByTimeAsync(50);
    elapsed += 50;
  }
  // Advance once more so any pending response setTimeout(..., 0) handlers
  // (and their follow-up microtasks) run before we return.
  await vi.advanceTimersByTimeAsync(50);
}

beforeEach(() => {
  netCalls.length = 0;
  responsesByHost.clear();
  defaultResponse = { statusCode: 200, body: 'ok' };
  __resetGatesForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ---------------------------------------------------------------- */
/*  parseRetryAfter                                                   */
/* ---------------------------------------------------------------- */

describe('parseRetryAfter', () => {
  it('parses integer seconds', () => {
    expect(parseRetryAfter({ 'retry-after': '30' })).toBe(30_000);
    expect(parseRetryAfter({ 'Retry-After': '5' })).toBe(5_000);
  });

  it('parses HTTP-date', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const tenSecondsLater = new Date('2025-01-01T00:00:10Z').toUTCString();
    const result = parseRetryAfter({ 'retry-after': tenSecondsLater });
    expect(result).toBeGreaterThanOrEqual(9_000);
    expect(result).toBeLessThanOrEqual(11_000);
  });

  it('clamps values > 5 minutes to 300_000 ms', () => {
    // 10 minutes in seconds.
    expect(parseRetryAfter({ 'retry-after': '600' })).toBe(300_000);
  });

  it('returns null on garbage', () => {
    expect(parseRetryAfter({ 'retry-after': 'not-a-date' })).toBeNull();
    expect(parseRetryAfter({})).toBeNull();
    expect(parseRetryAfter({ 'retry-after': '' })).toBeNull();
  });

  it('falls back to x-ratelimit-reset (epoch seconds)', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const now = Math.floor(Date.now() / 1000);
    const resetIn30s = now + 30;
    const result = parseRetryAfter({ 'x-ratelimit-reset': String(resetIn30s) });
    expect(result).toBeGreaterThanOrEqual(29_000);
    expect(result).toBeLessThanOrEqual(31_000);
  });

  it('returns null for negative x-ratelimit-reset', () => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(parseRetryAfter({ 'x-ratelimit-reset': String(past) })).toBeNull();
  });
});

/* ---------------------------------------------------------------- */
/*  HttpError                                                         */
/* ---------------------------------------------------------------- */

describe('HttpError', () => {
  it('preserves status and retryAfterMs', () => {
    const err = new HttpError('https://example.com', 429, { 'retry-after': '3' }, 3_000);
    expect(err.name).toBe('HttpError');
    expect(err.status).toBe(429);
    expect(err.url).toBe('https://example.com');
    expect(err.headers).toEqual({ 'retry-after': '3' });
    expect(err.retryAfterMs).toBe(3_000);
    expect(err.message).toContain('429');
  });
});

/* ---------------------------------------------------------------- */
/*  Gate integration                                                  */
/* ---------------------------------------------------------------- */

describe('requestText gate integration', () => {
  it('gates known host (lrclib.net): three calls spaced >= 250 ms apart', async () => {
    const p1 = requestText('https://lrclib.net/a');
    const p2 = requestText('https://lrclib.net/b');
    const p3 = requestText('https://lrclib.net/c');

    await waitForNetCalls(3);
    await Promise.all([p1, p2, p3]);

    expect(netCalls).toHaveLength(3);
    expect(netCalls[1].time - netCalls[0].time).toBeGreaterThanOrEqual(250);
    expect(netCalls[2].time - netCalls[1].time).toBeGreaterThanOrEqual(250);
  });

  it('does not gate unknown host: three calls fire ~t=0', async () => {
    const t0 = Date.now();
    const p1 = requestText('https://api.shiranami.app/a');
    const p2 = requestText('https://api.shiranami.app/b');
    const p3 = requestText('https://api.shiranami.app/c');

    await waitForNetCalls(3);
    await Promise.all([p1, p2, p3]);

    expect(netCalls).toHaveLength(3);
    for (const call of netCalls) {
      expect(call.time - t0).toBeLessThan(100);
    }
  });

  it('on 429 with Retry-After: 3, next call waits 3000 ms', async () => {
    queueResponse('lrclib.net', {
      statusCode: 429,
      headers: { 'retry-after': '3' },
    });
    queueResponse('lrclib.net', { statusCode: 200, body: 'ok' });

    const p1 = requestText('https://lrclib.net/x');
    const p2 = requestText('https://lrclib.net/y');

    // Drive the first call to rejection.
    await vi.advanceTimersByTimeAsync(50);
    await expect(p1).rejects.toBeInstanceOf(HttpError);
    await expect(p1.catch(e => e)).resolves.toMatchObject({ status: 429 });

    // Second call should now be gated by ~3000 ms.
    await waitForNetCalls(2);
    await p2;

    expect(netCalls).toHaveLength(2);
    const delta = netCalls[1].time - netCalls[0].time;
    expect(delta).toBeGreaterThanOrEqual(3_000);
  });

  it('429 without Retry-After uses 60_000 ms fallback', async () => {
    queueResponse('lrclib.net', { statusCode: 429, headers: {} });
    queueResponse('lrclib.net', { statusCode: 200, body: 'ok' });

    const p1 = requestText('https://lrclib.net/x');
    const p2 = requestText('https://lrclib.net/y');

    await vi.advanceTimersByTimeAsync(50);
    await expect(p1).rejects.toBeInstanceOf(HttpError);

    await waitForNetCalls(2, 120_000);
    await p2;

    const delta = netCalls[1].time - netCalls[0].time;
    expect(delta).toBeGreaterThanOrEqual(60_000);
  });

  it('non-429 error (500) does not bump gate — next call waits only minIntervalMs', async () => {
    queueResponse('lrclib.net', { statusCode: 500 });
    queueResponse('lrclib.net', { statusCode: 200, body: 'ok' });

    const p1 = requestText('https://lrclib.net/x');
    const p2 = requestText('https://lrclib.net/y');

    await vi.advanceTimersByTimeAsync(50);
    await expect(p1).rejects.toBeInstanceOf(HttpError);

    await waitForNetCalls(2);
    await p2;

    const delta = netCalls[1].time - netCalls[0].time;
    // Only the baseline 250 ms spacing — definitely well under the 60 s fallback.
    expect(delta).toBeGreaterThanOrEqual(250);
    expect(delta).toBeLessThan(5_000);
  });

  it('per-host isolation: lrclib.net and i.ytimg.com do not block each other', async () => {
    const t0 = Date.now();
    const pL = requestText('https://lrclib.net/x');
    const pY = requestText('https://i.ytimg.com/y');

    await waitForNetCalls(2);
    await Promise.all([pL, pY]);

    expect(netCalls).toHaveLength(2);
    // Both first-in-gate calls fire immediately.
    for (const call of netCalls) {
      expect(call.time - t0).toBeLessThan(100);
    }
  });
});
