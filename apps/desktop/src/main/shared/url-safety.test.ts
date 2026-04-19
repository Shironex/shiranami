import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dns from 'node:dns';

vi.mock('node:dns', () => ({
  promises: { lookup: vi.fn() },
}));

import { isStreamUrlAllowed, parseStreamUrl } from './url-safety';

const mockedLookup = vi.mocked(dns.promises.lookup);

beforeEach(() => {
  mockedLookup.mockReset();
});

/* ------------------------------------------------------------------ */
/*  parseStreamUrl                                                    */
/* ------------------------------------------------------------------ */

describe('parseStreamUrl', () => {
  it('returns null for empty string', () => {
    expect(parseStreamUrl('')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(parseStreamUrl('not a url')).toBeNull();
  });

  it('returns a URL for a valid input', () => {
    const u = parseStreamUrl('http://stream.example.com/live');
    expect(u).toBeInstanceOf(URL);
    expect(u?.hostname).toBe('stream.example.com');
  });
});

/* ------------------------------------------------------------------ */
/*  isStreamUrlAllowed — parse / scheme failures                      */
/* ------------------------------------------------------------------ */

describe('isStreamUrlAllowed — parse / scheme', () => {
  it('rejects empty string with reason `parse`', async () => {
    const r = await isStreamUrlAllowed('');
    expect(r).toEqual({ ok: false, reason: 'parse' });
  });

  it('rejects garbage with reason `parse`', async () => {
    const r = await isStreamUrlAllowed('not a url');
    expect(r).toEqual({ ok: false, reason: 'parse' });
  });

  it('rejects data: URLs', async () => {
    const r = await isStreamUrlAllowed('data:text/plain,hello');
    expect(r).toEqual({ ok: false, reason: 'scheme' });
  });

  it('rejects file: URLs', async () => {
    const r = await isStreamUrlAllowed('file:///etc/passwd');
    expect(r).toEqual({ ok: false, reason: 'scheme' });
  });

  it('rejects javascript: URLs', async () => {
    const r = await isStreamUrlAllowed('javascript:alert(1)');
    expect(r).toEqual({ ok: false, reason: 'scheme' });
  });

  it('rejects ftp: URLs', async () => {
    const r = await isStreamUrlAllowed('ftp://example.com/');
    expect(r).toEqual({ ok: false, reason: 'scheme' });
  });
});

/* ------------------------------------------------------------------ */
/*  isStreamUrlAllowed — literal IPv4 deny ranges                     */
/* ------------------------------------------------------------------ */

describe('isStreamUrlAllowed — literal IPv4', () => {
  it('rejects loopback (127.0.0.1)', async () => {
    const r = await isStreamUrlAllowed('http://127.0.0.1/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('rejects RFC1918 10.0.0.0/8', async () => {
    const r = await isStreamUrlAllowed('http://10.0.0.5/stream');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects RFC1918 192.168.0.0/16', async () => {
    const r = await isStreamUrlAllowed('http://192.168.1.1/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects RFC1918 172.16.0.0/12', async () => {
    const r = await isStreamUrlAllowed('http://172.16.0.1/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects link-local / AWS metadata 169.254.169.254', async () => {
    const r = await isStreamUrlAllowed('http://169.254.169.254/latest/meta-data/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects multicast 224.0.0.1', async () => {
    const r = await isStreamUrlAllowed('http://224.0.0.1/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects unspecified 0.0.0.0', async () => {
    const r = await isStreamUrlAllowed('http://0.0.0.0/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects WHATWG-canonicalized decimal-IP form (http://2130706433/ → 127.0.0.1)', async () => {
    // WHATWG URL parser canonicalizes decimal IPs to dotted-quad. The literal
    // path fires and the loopback check rejects. If Node ever stops doing this,
    // the test should still reject (via parse / scheme / dns). Either way: deny.
    const r = await isStreamUrlAllowed('http://2130706433/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('private-ip');
    }
    expect(mockedLookup).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  isStreamUrlAllowed — literal IPv6 deny ranges                     */
/* ------------------------------------------------------------------ */

describe('isStreamUrlAllowed — literal IPv6', () => {
  it('rejects bracketed loopback [::1]', async () => {
    const r = await isStreamUrlAllowed('http://[::1]/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects IPv4-mapped IPv6 [::ffff:127.0.0.1] (no IPv4 bypass via v6 form)', async () => {
    const r = await isStreamUrlAllowed('http://[::ffff:127.0.0.1]/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects deprecated IPv4-compatible IPv6 [::127.0.0.1] form', async () => {
    // ipaddr.js v2.x classifies this as `ipv4Mapped` and isIPv4MappedAddress()
    // returns true, so the unwrap branch fires and we re-classify as IPv4
    // loopback. This test guards against a future library version tightening
    // that detection and silently letting `::127.0.0.1` through.
    const r = await isStreamUrlAllowed('http://[::127.0.0.1]/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects deprecated IPv4-compatible IPv6 form for AWS metadata IP', async () => {
    const r = await isStreamUrlAllowed('http://[::169.254.169.254]/latest/meta-data/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects IPv6 link-local fe80::/10', async () => {
    const r = await isStreamUrlAllowed('http://[fe80::1]/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects IPv6 unique-local fc00::/7', async () => {
    const r = await isStreamUrlAllowed('http://[fc00::1]/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects IPv6 multicast ff00::/8', async () => {
    const r = await isStreamUrlAllowed('http://[ff00::1]/');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });
});

/* ------------------------------------------------------------------ */
/*  isStreamUrlAllowed — DNS resolution path                          */
/* ------------------------------------------------------------------ */

describe('isStreamUrlAllowed — DNS', () => {
  it('accepts a hostname resolving to a public IP', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);

    const r = await isStreamUrlAllowed('http://stream.example.com/live');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.hostname).toBe('stream.example.com');
    }
    expect(mockedLookup).toHaveBeenCalledWith('stream.example.com', {
      all: true,
      verbatim: true,
    });
  });

  it('rejects a hostname that resolves to loopback (DNS rebinding)', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

    const r = await isStreamUrlAllowed('http://stream.example.com/live');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('rejects when ANY returned address is denied (any-deny rule)', async () => {
    mockedLookup.mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);

    const r = await isStreamUrlAllowed('http://stream.example.com/live');
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('returns reason `dns` when lookup throws (ENOTFOUND)', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    mockedLookup.mockRejectedValueOnce(err);

    const r = await isStreamUrlAllowed('http://nope.example.invalid/');
    expect(r).toEqual({ ok: false, reason: 'dns' });
  });

  it('preserves port and query string on success', async () => {
    mockedLookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);

    const r = await isStreamUrlAllowed('http://stream.example.com:8000/path?q=1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.port).toBe('8000');
      expect(r.url.pathname).toBe('/path');
      expect(r.url.search).toBe('?q=1');
    }
  });
});
