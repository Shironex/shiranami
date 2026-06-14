import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
const mockFetch = vi.fn();
const mockIsStreamUrlAllowed = vi.fn();
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.0-test',
  },
  protocol: {
    handle(_scheme: string, handler: (req: Request) => Promise<Response>) {
      capturedHandler = handler;
    },
  },
  net: {
    fetch: (...args: unknown[]) => mockFetch(...args),
  },
}));

vi.mock('./app/logger', () => ({
  logger: {
    info: (...args: unknown[]) => loggerMock.info(...args),
    warn: (...args: unknown[]) => loggerMock.warn(...args),
    error: (...args: unknown[]) => loggerMock.error(...args),
    debug: (...args: unknown[]) => loggerMock.debug(...args),
  },
}));

vi.mock('./shared/url-safety', () => ({
  isStreamUrlAllowed: (...args: unknown[]) => mockIsStreamUrlAllowed(...args),
}));

import { registerRadioProtocol } from './radio-protocol';

const STREAM_URL = 'http://stream.example.com/live';
const STREAM_REQUEST_URL = `shiranami-radio://stream?url=${encodeURIComponent(STREAM_URL)}`;

function okGuardFor(url: string) {
  return { ok: true, url: new URL(url) } as const;
}

function makeResponse(init: {
  status: number;
  body?: ReadableStream | null;
  headers?: HeadersInit;
}) {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    body: init.body ?? null,
    headers: new Headers(init.headers ?? {}),
  };
}

describe('radio-protocol', () => {
  beforeEach(() => {
    capturedHandler = null;
    mockFetch.mockReset();
    mockIsStreamUrlAllowed.mockReset();
    mockIsStreamUrlAllowed.mockResolvedValue(okGuardFor(STREAM_URL));
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
    registerRadioProtocol();
  });

  /* ---------------------------------------------------------------- */
  /*  Existing baseline behaviour                                     */
  /* ---------------------------------------------------------------- */

  it('returns 400 when url parameter is missing', async () => {
    const res = await capturedHandler!(new Request('shiranami-radio://stream'));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockIsStreamUrlAllowed).not.toHaveBeenCalled();
  });

  it('proxies upstream stream with forwarded content-type', async () => {
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue(
      makeResponse({
        status: 200,
        body: upstreamBody,
        headers: { 'content-type': 'audio/aac' },
      })
    );

    const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/aac');
    expect(res.headers.get('Accept-Ranges')).toBe('none');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store');
    expect(mockFetch).toHaveBeenCalledWith(
      STREAM_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Icy-MetaData': '0' }),
        redirect: 'manual',
      })
    );
  });

  it('defaults Content-Type to audio/mpeg when upstream omits it', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({
        status: 200,
        body: new ReadableStream({
          start(c) {
            c.close();
          },
        }),
      })
    );

    const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));

    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('forwards upstream error status', async () => {
    mockFetch.mockResolvedValue(makeResponse({ status: 502 }));

    const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));
    expect(res.status).toBe(502);
  });

  it('returns 499 when upstream fetch aborts', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    mockFetch.mockRejectedValue(abortErr);

    const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));
    expect(res.status).toBe(499);
  });

  it('returns 500 on unexpected errors', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));
    expect(res.status).toBe(500);
  });

  /* ---------------------------------------------------------------- */
  /*  SSRF guard — initial URL                                        */
  /* ---------------------------------------------------------------- */

  describe('SSRF guard — initial URL', () => {
    it('returns 403 when guard rejects with reason `scheme`', async () => {
      mockIsStreamUrlAllowed.mockResolvedValueOnce({ ok: false, reason: 'scheme' });

      const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));
      expect(res.status).toBe(403);
      expect(await res.text()).toBe('Forbidden');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 403 when guard rejects with reason `private-ip`', async () => {
      mockIsStreamUrlAllowed.mockResolvedValueOnce({ ok: false, reason: 'private-ip' });

      const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 403 when guard rejects with reason `parse`', async () => {
      mockIsStreamUrlAllowed.mockResolvedValueOnce({ ok: false, reason: 'parse' });

      const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('logs a warn including the attempted URL on rejection', async () => {
      mockIsStreamUrlAllowed.mockResolvedValueOnce({ ok: false, reason: 'private-ip' });

      await capturedHandler!(new Request(STREAM_REQUEST_URL));

      expect(loggerMock.warn).toHaveBeenCalledTimes(1);
      const message = loggerMock.warn.mock.calls[0]?.[0] as string;
      expect(message).toContain(STREAM_URL);
      expect(message).toContain('private-ip');
    });

    it('calls the guard before any fetch', async () => {
      const order: string[] = [];
      mockIsStreamUrlAllowed.mockImplementationOnce(async () => {
        order.push('guard');
        return okGuardFor(STREAM_URL);
      });
      mockFetch.mockImplementationOnce(async () => {
        order.push('fetch');
        return makeResponse({
          status: 200,
          body: new ReadableStream({
            start(c) {
              c.close();
            },
          }),
        });
      });

      await capturedHandler!(new Request(STREAM_REQUEST_URL));
      expect(order).toEqual(['guard', 'fetch']);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Redirect re-validation                                          */
  /* ---------------------------------------------------------------- */

  describe('redirect re-validation', () => {
    it('follows a single safe redirect and streams the final body', async () => {
      const redirectTarget = 'http://other.example.com/path';
      mockIsStreamUrlAllowed
        .mockResolvedValueOnce(okGuardFor(STREAM_URL))
        .mockResolvedValueOnce(okGuardFor(redirectTarget));

      const finalBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([42]));
          controller.close();
        },
      });

      mockFetch
        .mockResolvedValueOnce(
          makeResponse({
            status: 302,
            headers: { location: redirectTarget },
          })
        )
        .mockResolvedValueOnce(
          makeResponse({
            status: 200,
            body: finalBody,
            headers: { 'content-type': 'audio/aac' },
          })
        );

      const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/aac');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        STREAM_URL,
        expect.objectContaining({ redirect: 'manual' })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        redirectTarget,
        expect.objectContaining({ redirect: 'manual' })
      );
    });

    it('rejects with 403 when redirect target is denied', async () => {
      const evilTarget = 'http://10.0.0.1/';
      mockIsStreamUrlAllowed
        .mockResolvedValueOnce(okGuardFor(STREAM_URL))
        .mockResolvedValueOnce({ ok: false, reason: 'private-ip' });

      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 302,
          headers: { location: evilTarget },
        })
      );

      const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));

      expect(res.status).toBe(403);
      expect(await res.text()).toBe('Forbidden');
      // Only the initial fetch should have happened — the redirected hop is
      // refused before the second net.fetch call.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const warns = loggerMock.warn.mock.calls.map(c => String(c[0]));
      expect(warns.some(m => m.includes('blocked redirect') && m.includes('private-ip'))).toBe(
        true
      );
    });

    it('rejects with 403 after MAX_REDIRECTS hops', async () => {
      // 6 consecutive redirects; all guard-ok. The handler must give up.
      mockIsStreamUrlAllowed.mockImplementation(async (input: string) => okGuardFor(input));

      const targets = [
        'http://r1.example.com/',
        'http://r2.example.com/',
        'http://r3.example.com/',
        'http://r4.example.com/',
        'http://r5.example.com/',
        'http://r6.example.com/',
      ];

      // Initial fetch + each subsequent hop returns another 302.
      mockFetch.mockImplementation(async () => {
        const callIndex = mockFetch.mock.calls.length - 1;
        return makeResponse({
          status: 302,
          headers: { location: targets[callIndex] ?? targets[targets.length - 1]! },
        });
      });

      const res = await capturedHandler!(new Request(STREAM_REQUEST_URL));

      expect(res.status).toBe(403);
      // Initial call + MAX_REDIRECTS (5) follows = 6 fetches, no infinite loop.
      expect(mockFetch).toHaveBeenCalledTimes(6);
      const warns = loggerMock.warn.mock.calls.map(c => String(c[0]));
      expect(warns.some(m => m.includes('redirect chain exceeded'))).toBe(true);
    });
  });
});
