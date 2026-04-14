import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedHandler: ((req: Request) => Promise<Response>) | null = null;
const mockFetch = vi.fn();

vi.mock('electron', () => ({
  protocol: {
    handle(_scheme: string, handler: (req: Request) => Promise<Response>) {
      capturedHandler = handler;
    },
  },
  net: {
    fetch: (...args: unknown[]) => mockFetch(...args),
  },
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { registerRadioProtocol } from './radio-protocol';

describe('radio-protocol', () => {
  beforeEach(() => {
    capturedHandler = null;
    mockFetch.mockReset();
    registerRadioProtocol();
  });

  it('returns 400 when url parameter is missing', async () => {
    const res = await capturedHandler!(new Request('shiranami-radio://stream'));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('proxies upstream stream with forwarded content-type', async () => {
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: upstreamBody,
      headers: new Headers({ 'content-type': 'audio/aac' }),
    });

    const url = `shiranami-radio://stream?url=${encodeURIComponent('http://stream.example.com/live')}`;
    const res = await capturedHandler!(new Request(url));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/aac');
    expect(res.headers.get('Accept-Ranges')).toBe('none');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://stream.example.com/live',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Icy-MetaData': '0' }),
      }),
    );
  });

  it('defaults Content-Type to audio/mpeg when upstream omits it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({ start(c) { c.close(); } }),
      headers: new Headers(),
    });

    const url = `shiranami-radio://stream?url=${encodeURIComponent('http://stream.example.com/live')}`;
    const res = await capturedHandler!(new Request(url));

    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('forwards upstream error status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      body: null,
      headers: new Headers(),
    });

    const url = `shiranami-radio://stream?url=${encodeURIComponent('http://stream.example.com/live')}`;
    const res = await capturedHandler!(new Request(url));
    expect(res.status).toBe(502);
  });

  it('returns 499 when upstream fetch aborts', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    mockFetch.mockRejectedValue(abortErr);

    const url = `shiranami-radio://stream?url=${encodeURIComponent('http://stream.example.com/live')}`;
    const res = await capturedHandler!(new Request(url));
    expect(res.status).toBe(499);
  });

  it('returns 500 on unexpected errors', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    const url = `shiranami-radio://stream?url=${encodeURIComponent('http://stream.example.com/live')}`;
    const res = await capturedHandler!(new Request(url));
    expect(res.status).toBe(500);
  });
});
