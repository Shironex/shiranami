/**
 * §2.4's loopback media server, exercised from the page that has to talk to it.
 *
 * # Why this cannot be a Rust integration test
 *
 * `shiranami-serve` has its own tests and they cover the router. What they
 * cannot cover is the reason the server exists at all: macOS 26.6 stopped
 * delivering cross-scheme subresource requests to `WKURLSchemeHandler`
 * (wry#1778), so v1's `shiranami-audio://` scheme silently returned nothing to a
 * page on `tauri://localhost`. The failure was *silent* — no error, no handler
 * call, just no audio — and the only place it is visible is a real webview
 * making a real request across the origin boundary. That is what every `fetch`
 * below is: issued from `tauri://localhost`, answered by `127.0.0.1`, subject to
 * the production CSP's `connect-src`.
 *
 * # Why it asserts bytes and status codes rather than "did it play"
 *
 * Playing requires an autoplay gesture the harness cannot honestly give, and a
 * transport that reports `isPlaying: true` while the element buffers nothing
 * would satisfy a naive assertion. A 206 with a correct `Content-Range` and the
 * right number of bytes cannot be faked by a stalled decoder.
 */

import fs from 'node:fs';

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { waitForLogLine, servePort } from '../helpers/logs.js';

const HOME = profile('migrated').home;

interface Serve {
  origin: string;
  token: string;
}

/** `serve_info` — the ephemeral port and this session's path token. */
async function serveInfo(): Promise<Serve> {
  return browser.execute(async () =>
    (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string) => Promise<Serve> };
      }
    ).__TAURI_INTERNALS__.invoke('serve_info')
  );
}

/** One `fetch` from the webview, reported as data the spec can assert on. */
async function get(
  url: string,
  headers: Record<string, string> = {}
): Promise<{
  status: number;
  contentType: string | null;
  contentRange: string | null;
  bytes: number;
}> {
  return browser.execute(
    async (target, init) => {
      const response = await fetch(target, { headers: init });
      const buffer = await response.arrayBuffer();
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentRange: response.headers.get('content-range'),
        bytes: buffer.byteLength,
      };
    },
    url,
    headers
  );
}

describe('playback serve', () => {
  let serve: Serve;
  let filePath: string;
  let fileSize: number;

  before(async () => {
    await waitForStores();
    await waitForShell();

    await waitForLogLine(HOME, 'the loopback media server is listening', { timeout: 30_000 });
    serve = await serveInfo();

    const tracks = await browser.execute(async () => window.electronAPI.db.tracks.getAll());
    filePath = tracks[0].filePath;
    fileSize = fs.statSync(filePath).size;
  });

  it('announced an origin and a token', () => {
    expect(serve.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // 32 bytes of lowercase hex, URL-safe without percent-encoding.
    expect(serve.token).toMatch(/^[0-9a-f]{64}$/);

    // The port in the URL is the port the backend logged.
    expect(serve.origin.endsWith(`:${servePort(HOME)}`)).toBe(true);
  });

  it('serves a whole audio file', async () => {
    const response = await get(
      `${serve.origin}/${serve.token}/audio?path=${encodeURIComponent(filePath)}`
    );

    expect(response.status).toBe(200);
    expect(response.bytes).toBe(fileSize);
    expect(response.contentType).toMatch(/^audio\//);
  });

  it('answers a range request with exactly that range', async () => {
    // The seek path. A server that ignored `Range` and returned 200 with the
    // whole body would still let a track play from the start, so the status code
    // is as load-bearing as the bytes.
    const response = await get(
      `${serve.origin}/${serve.token}/audio?path=${encodeURIComponent(filePath)}`,
      { Range: 'bytes=0-1023' }
    );

    expect(response.status).toBe(206);
    expect(response.bytes).toBe(1024);
    expect(response.contentRange).toBe(`bytes 0-1023/${fileSize}`);
  });

  it('serves a range that runs to the end of the file', async () => {
    const start = fileSize - 100;
    const response = await get(
      `${serve.origin}/${serve.token}/audio?path=${encodeURIComponent(filePath)}`,
      { Range: `bytes=${start}-` }
    );

    expect(response.status).toBe(206);
    expect(response.bytes).toBe(100);
    expect(response.contentRange).toBe(`bytes ${start}-${fileSize - 1}/${fileSize}`);
  });

  it('refuses a wrong token', async () => {
    // 404 rather than 401, deliberately: `token.rs` documents that a 401 would
    // tell a prober the route exists and only the credential was wrong.
    const wrong = serve.token.replace(/./, char => (char === 'a' ? 'b' : 'a'));
    const response = await get(
      `${serve.origin}/${wrong}/audio?path=${encodeURIComponent(filePath)}`
    );

    expect(response.status).toBe(404);
    expect(response.bytes).toBe(0);
  });

  it('refuses a path outside the library', async () => {
    // The containment guard. The token is a capability that reads *allowed*
    // files; without this it would read any file the user can.
    const response = await get(
      `${serve.origin}/${serve.token}/audio?path=${encodeURIComponent('/etc/passwd')}`
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.bytes).toBe(0);
  });

  it('logged the served request', async () => {
    // `shiranami_serve=debug` is set for exactly this line — the capability's
    // `LOG_LEVEL` raises that one target and nothing else. It is the evidence
    // that the request reached Rust rather than being answered from a cache.
    const line = await waitForLogLine(HOME, 'shiranami_serve', { timeout: 15_000 });
    expect(line).toContain('shiranami_serve');
  });

  it('rewrote the v1 art scheme onto the same server', async () => {
    // §3.3 leaves `tracks.album_art` holding v1's `shiranami-art://` string in
    // the database and rewrites it at the bridge instead, by value. The migrated
    // rows carry exactly that scheme, so this is the one place the rewrite can
    // be checked end to end: what the renderer receives must already be an
    // address this server answers.
    const art = await browser.execute(async () => {
      const tracks = await window.electronAPI.db.tracks.getAll();
      return tracks.map(track => track.albumArt).find(value => value !== null) ?? null;
    });

    expect(art).not.toBeNull();
    expect(art).toContain(`${serve.origin}/${serve.token}/art/`);
    expect(art).not.toContain('shiranami-art://');

    const response = await get(art as string);
    expect(response.status).toBe(200);
  });
});
