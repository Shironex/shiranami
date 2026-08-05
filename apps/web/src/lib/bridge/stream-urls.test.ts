/**
 * §2.4's URL builder, in both of the worlds it has to work in.
 *
 * Outside the Tauri webview — which is where this suite runs — every function
 * has to be the identity, because 1500-odd tests and eight stories assert on
 * v1's literal scheme strings. Inside it, the rewrite has to reach art URLs
 * wherever they appear in a payload, including fields no schema names.
 *
 * The Tauri half is simulated by installing `__TAURI_INTERNALS__` and resolving
 * a fake `serve_info`, which is the whole of what the real path does: there is
 * no transport to stub below that.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  initStreamUrls,
  restoreArtUrls,
  resetStreamUrlsForTests,
  rewriteArtUrls,
  streamUrlBase,
  toArtUrl,
  toStoredArtUrl,
  toStreamUrl,
  whenStreamUrlsReady,
  withRewrittenArtUrls,
} from './stream-urls';

const TAURI_GLOBAL = '__TAURI_INTERNALS__';

const ORIGIN = 'http://127.0.0.1:52341';
const TOKEN = 'a'.repeat(64);
const BASE = `${ORIGIN}/${TOKEN}`;

/** Pretend to be the webview and let the base resolve. */
async function withServer(): Promise<void> {
  Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
  initStreamUrls(() => Promise.resolve({ origin: ORIGIN, token: TOKEN }));
  await whenStreamUrlsReady();
}

afterEach(() => {
  Reflect.deleteProperty(window, TAURI_GLOBAL);
  resetStreamUrlsForTests();
});

describe('outside the Tauri webview', () => {
  it('never fetches, and leaves the base unset', () => {
    let called = false;
    initStreamUrls(() => {
      called = true;
      return Promise.resolve({ origin: ORIGIN, token: TOKEN });
    });

    expect(called).toBe(false);
    expect(streamUrlBase()).toBeNull();
  });

  it('emits v1’s audio URL unchanged, which is what the fixtures assert on', () => {
    expect(toStreamUrl('/Users/me/Music/song.mp3')).toBe(
      'shiranami-audio://play?path=%2FUsers%2Fme%2FMusic%2Fsong.mp3'
    );
  });

  it('passes a radio URL through untouched', () => {
    const radio = 'shiranami-radio://stream?url=https%3A%2F%2Fstream.example.com%2Flive';
    expect(toStreamUrl(radio)).toBe(radio);
  });

  it('leaves art URLs alone, so Storybook renders what it always did', () => {
    const payload = { albumArt: 'shiranami-art://art/abc123.jpg' };
    expect(rewriteArtUrls(payload)).toBe(payload);
  });
});

describe('inside the webview', () => {
  it('joins the origin and token with exactly one slash', async () => {
    await withServer();
    expect(streamUrlBase()).toBe(BASE);
  });

  it('rewrites an art URL onto the art route', async () => {
    await withServer();
    expect(toArtUrl('shiranami-art://art/abc123.jpg')).toBe(`${BASE}/art/abc123.jpg`);
  });

  it('builds an audio URL onto the audio route, path encoded', async () => {
    await withServer();
    expect(toStreamUrl('/Users/me/Music/a song.mp3')).toBe(
      `${BASE}/audio?path=%2FUsers%2Fme%2FMusic%2Fa%20song.mp3`
    );
  });

  it('normalises Windows separators before encoding, as v1 did', async () => {
    await withServer();
    expect(toStreamUrl('C:\\Music\\song.mp3')).toBe(`${BASE}/audio?path=C%3A%2FMusic%2Fsong.mp3`);
  });

  it('forwards the radio parameter verbatim rather than re-encoding it', async () => {
    await withServer();
    // A `+` in the upstream URL survives only if the encoded bytes are passed
    // through: the server reads the query as form-urlencoded, where a bare `+`
    // would decode to a space and address a different stream.
    const encoded = encodeURIComponent('https://stream.example.com/live?x=a+b');
    expect(toStreamUrl(`shiranami-radio://stream?url=${encoded}`)).toBe(
      `${BASE}/radio?url=${encoded}`
    );
  });

  it('leaves a real file path that is not art or radio to the audio route', async () => {
    await withServer();
    expect(toArtUrl('/Users/me/Music/song.mp3')).toBe('/Users/me/Music/song.mp3');
  });

  it('leaves remote cover URLs alone — a radio favicon is not ours to rewrite', async () => {
    await withServer();
    expect(toArtUrl('https://example.com/favicon.png')).toBe('https://example.com/favicon.png');
  });
});

describe('the deep rewrite', () => {
  it('reaches array elements, nested objects and differently-named fields', async () => {
    await withServer();

    const result = rewriteArtUrls({
      tracks: [{ id: '1', albumArt: 'shiranami-art://art/one.jpg' }],
      playlist: { coverArt: 'shiranami-art://art/two.jpg' },
      // The shape `EnrichLastRunPanel` renders: an art URL in an untyped diff,
      // which is why the rewrite matches on the value and not on a field name.
      diff: { field: 'albumArt', newValue: 'shiranami-art://art/three.jpg' },
    });

    expect(result.tracks[0].albumArt).toBe(`${BASE}/art/one.jpg`);
    expect(result.playlist.coverArt).toBe(`${BASE}/art/two.jpg`);
    expect(result.diff.newValue).toBe(`${BASE}/art/three.jpg`);
  });

  it('returns the same reference when nothing changed', async () => {
    await withServer();
    const payload = { tracks: [{ id: '1', albumArt: null, title: 'no art here' }] };
    expect(rewriteArtUrls(payload)).toBe(payload);
  });

  it('leaves nulls, numbers and booleans as they are', async () => {
    await withServer();
    const payload = { a: null, b: 3, c: false, d: undefined };
    expect(rewriteArtUrls(payload)).toEqual(payload);
  });
});

describe('the inbound restore', () => {
  it('turns a loopback art URL back into the value the database holds', () => {
    expect(toStoredArtUrl(`${BASE}/art/abc123.jpg`)).toBe('shiranami-art://art/abc123.jpg');
  });

  it('repairs a URL from a session that is already over', () => {
    // The whole reason the match is on the shape rather than on the live base:
    // a persisted queue entry or a rehydrated cache carries a dead port, and
    // writing that back is the bug in its second, quieter form.
    expect(toStoredArtUrl('http://127.0.0.1:60241/deadbeef/art/old.jpg')).toBe(
      'shiranami-art://art/old.jpg'
    );
    expect(toStoredArtUrl('http://localhost:1/t/art/local.jpg')).toBe(
      'shiranami-art://art/local.jpg'
    );
  });

  it('drops a query string or fragment, which name no cache file', () => {
    expect(toStoredArtUrl(`${BASE}/art/abc123.jpg?v=2`)).toBe('shiranami-art://art/abc123.jpg');
    expect(toStoredArtUrl(`${BASE}/art/abc123.jpg#top`)).toBe('shiranami-art://art/abc123.jpg');
  });

  it('leaves everything that is not a loopback art URL alone', () => {
    for (const value of [
      'shiranami-art://art/already.jpg',
      'https://example.com/cover.jpg',
      // A remote cover whose path merely contains the art segment.
      'https://example.com/tok/art/cover.jpg',
      'data:image/png;base64,AA',
      // A loopback URL for another route is not a cover.
      `${BASE}/audio?path=%2Fmusic%2Fa.mp3`,
      '/Users/me/Music/song.mp3',
      '',
    ]) {
      expect(toStoredArtUrl(value)).toBe(value);
    }
  });

  it('works without a base, so a shell that never answered still writes canonically', () => {
    expect(streamUrlBase()).toBeNull();
    expect(restoreArtUrls({ albumArt: `${BASE}/art/abc123.jpg` })).toEqual({
      albumArt: 'shiranami-art://art/abc123.jpg',
    });
  });

  it('reaches nested and differently-named fields, and shares nothing when unchanged', () => {
    const restored = restoreArtUrls({
      updates: [{ id: '1', data: { albumArt: `${BASE}/art/one.jpg` } }],
      playlist: { coverArt: `${BASE}/art/two.jpg` },
    });

    expect(restored.updates[0].data.albumArt).toBe('shiranami-art://art/one.jpg');
    expect(restored.playlist.coverArt).toBe('shiranami-art://art/two.jpg');

    const untouched = { tracks: [{ id: '1', albumArt: null }] };
    expect(restoreArtUrls(untouched)).toBe(untouched);
  });
});

describe('the command wrapper', () => {
  it('restores art URLs in the arguments before the command sees them', async () => {
    await withServer();

    const seen: unknown[] = [];
    const wrapped = withRewrittenArtUrls({
      dbTracksUpdateMany: (...args: unknown[]) => {
        seen.push(...args);
        return Promise.resolve(null);
      },
    });

    // Exactly what `applyEnrichResults` posts: the rewritten value it was shown.
    await wrapped.dbTracksUpdateMany([{ id: '1', data: { albumArt: `${BASE}/art/abc123.jpg` } }]);

    expect(seen).toEqual([[{ id: '1', data: { albumArt: 'shiranami-art://art/abc123.jpg' } }]]);
  });

  it('leaves the OS media surface its loopback URL', async () => {
    await withServer();

    const seen: unknown[] = [];
    const wrapped = withRewrittenArtUrls({
      mediaPlaybackState: (...args: unknown[]) => {
        seen.push(...args);
        return Promise.resolve(null);
      },
      // A `media_*` command with no art still round-trips normally.
      mediaClearState: () => Promise.resolve(null),
    });

    // souvlaki can only load http, and `shiranami-media-controls` resolves this
    // URL back to the cache file it names. Restoring it here would put OS media
    // controls back to coverless.
    await wrapped.mediaPlaybackState({ title: 'A', albumArt: `${BASE}/art/abc123.jpg` });
    await wrapped.mediaClearState();

    expect(seen).toEqual([{ title: 'A', albumArt: `${BASE}/art/abc123.jpg` }]);
  });

  it('still returns a displayable URL from a command whose argument it restored', async () => {
    await withServer();

    const wrapped = withRewrittenArtUrls({
      dbTracksUpdate: (_id: unknown, data: { albumArt: string }) => Promise.resolve(data),
    });

    const returned = await wrapped.dbTracksUpdate('1', { albumArt: `${BASE}/art/abc123.jpg` });
    expect(returned.albumArt).toBe(`${BASE}/art/abc123.jpg`);
  });

  it('rewrites results and waits for the base before answering', async () => {
    Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });

    // Deliberately not awaited: the base is still in flight when the command is
    // called, which is the race a library fetch at mount would lose.
    let release: (info: { origin: string; token: string }) => void = () => {};
    initStreamUrls(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );

    const surface = {
      dbTracksGetAll: () =>
        Promise.resolve([{ id: '1', albumArt: 'shiranami-art://art/late.jpg' }]),
    };
    const wrapped = withRewrittenArtUrls(surface);

    const pending = wrapped.dbTracksGetAll();
    release({ origin: ORIGIN, token: TOKEN });

    expect((await pending)[0].albumArt).toBe(`${BASE}/art/late.jpg`);
  });

  it('returns the same wrapped function on repeated reads', () => {
    const surface = { healthCheck: () => Promise.resolve({ status: 'ok' }) };
    const wrapped = withRewrittenArtUrls(surface);
    expect(wrapped.healthCheck).toBe(wrapped.healthCheck);
  });

  it('passes rejections through untouched', async () => {
    await withServer();
    const failure = new Error('nope');
    const wrapped = withRewrittenArtUrls({ boom: () => Promise.reject(failure) });

    let caught: unknown;
    try {
      await wrapped.boom();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
  });
});

describe('a shell that cannot answer', () => {
  it('degrades to v1 URLs rather than inventing an origin', async () => {
    Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
    initStreamUrls(() => Promise.reject(new Error('not booted')));
    await whenStreamUrlsReady();

    expect(streamUrlBase()).toBeNull();
    expect(toArtUrl('shiranami-art://art/abc.jpg')).toBe('shiranami-art://art/abc.jpg');
  });
});
