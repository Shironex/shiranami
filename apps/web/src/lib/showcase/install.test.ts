/**
 * Showcase mode has to be invisible unless a page asks for it by URL, and when
 * it is asked for, the fixture library must still load only on first use.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands as generated } from '@shiranami/contracts/bindings';
import { commands } from '@/lib/bridge/commands';
import { streamUrlBase } from '@/lib/bridge/stream-urls';
import { freezeClock, SHOWCASE_NOW, seededRandom } from './determinism';
import { isShowcaseRequested } from './flag';
import { installShowcaseMode, SHOWCASE_PLATFORM, type ShowcaseFixtureModule } from './install';

const originalApi = Object.getOwnPropertyDescriptor(window, 'electronAPI');
const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
const originalDate = globalThis.Date;
const originalRandom = Math.random;
const originalFetch = window.fetch;
const originalUrl = window.location.href;

function fixtures(overrides: Partial<ShowcaseFixtureModule> = {}): ShowcaseFixtureModule {
  return {
    api: {
      app: { getVersion: async () => '9.9.9' },
      media: { onCommand: () => () => {} },
    },
    respond: async url => {
      throw new TypeError(`blocked ${url.href}`);
    },
    ...overrides,
  };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  if (originalApi) Object.defineProperty(window, 'electronAPI', originalApi);
  if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
  globalThis.Date = originalDate;
  Math.random = originalRandom;
  window.fetch = originalFetch;
  delete document.documentElement.dataset.showcase;
  window.history.replaceState(null, '', originalUrl);
});

describe('showcase mode off (the default)', () => {
  it('is not requested without ?showcase=1', () => {
    expect(isShowcaseRequested()).toBe(false);

    window.history.replaceState(null, '', '/?showcase=0');
    expect(isShowcaseRequested()).toBe(false);
  });

  it('installs nothing and never loads the fixtures', () => {
    const loader = vi.fn(async () => fixtures());
    const before = window.electronAPI;
    const storage = window.localStorage;

    expect(installShowcaseMode(loader)).toBe(false);

    expect(loader).not.toHaveBeenCalled();
    expect(window.electronAPI).toBe(before);
    expect(window.localStorage).toBe(storage);
    expect(globalThis.Date).toBe(originalDate);
    expect(Math.random).toBe(originalRandom);
    expect(document.documentElement.dataset.showcase).toBeUndefined();
  });

  it('was not installed by the bridge seam this suite already imported', () => {
    // `src/test/setup.ts` imports the app graph, which runs `@/lib/bridge/install`
    // at module scope; without the flag the suite's own mock must survive it.
    expect(document.documentElement.dataset.showcase).toBeUndefined();
    expect(window.electronAPI.platform).not.toBe(undefined);
  });
});

describe('showcase mode on (?showcase=1)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?showcase=1&lang=pl');
  });

  it('installs a surface synchronously but loads the fixtures only on first call', async () => {
    const loader = vi.fn(async () => fixtures());

    expect(installShowcaseMode(loader)).toBe(true);
    expect(loader).not.toHaveBeenCalled();

    // Bootstrap data is answered without the fixtures.
    expect(window.electronAPI.platform).toBe(SHOWCASE_PLATFORM);
    expect(window.electronAPI.__e2e).toBe(false);
    expect(typeof window.electronAPI.errors.isIpcError).toBe('function');
    expect(loader).not.toHaveBeenCalled();

    await expect(window.electronAPI.app.getVersion()).resolves.toBe('9.9.9');
    await window.electronAPI.app.getVersion();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('hands back an unsubscribe function synchronously', () => {
    installShowcaseMode(async () => fixtures());

    const off = window.electronAPI.media.onCommand(() => {});
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });

  it('answers a method the fixtures lack with undefined, not a rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installShowcaseMode(async () => fixtures());

    await expect(window.electronAPI.shell.showInFolder('/x')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('shell.showInFolder'));
    warn.mockRestore();
  });

  it('freezes the clock, seeds randomness and swaps in the demo profile', () => {
    const realStorage = window.localStorage;
    realStorage.setItem('shiranami.language', 'en');

    installShowcaseMode(async () => fixtures());

    expect(Date.now()).toBe(SHOWCASE_NOW);
    expect(new Date().getTime()).toBe(SHOWCASE_NOW);
    expect(Math.random()).toBe(seededRandom(0x5eed_2026)());
    expect(window.localStorage).not.toBe(realStorage);
    expect(window.localStorage.getItem('shiranami.language')).toBe('pl');
    expect(realStorage.getItem('shiranami.language')).toBe('en');
    expect(document.documentElement.dataset.showcase).toBe('true');
    realStorage.removeItem('shiranami.language');
  });

  it('keeps cross-origin requests off the network', async () => {
    const respond = vi.fn(async () => new Response('stub'));
    const realFetch = vi.fn(async () => new Response('real'));
    window.fetch = realFetch;

    installShowcaseMode(async () => fixtures({ respond }));

    await window.fetch('https://all.api.radio-browser.info/json/servers');
    expect(respond).toHaveBeenCalledTimes(1);
    expect(realFetch).not.toHaveBeenCalled();

    await window.fetch('/assets/local.json');
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('hands local URLs and unparseable input to the real fetch', async () => {
    const respond = vi.fn(async () => new Response('stub'));
    const realFetch = vi.fn(async (_input: RequestInfo | URL) => new Response('real'));
    window.fetch = realFetch;

    installShowcaseMode(async () => fixtures({ respond }));

    await window.fetch('data:image/svg+xml,%3Csvg%2F%3E');
    await window.fetch('blob:http://localhost/0b8f3c1e-7a9d-4c56-9e2a-4f1d2c3b4a5e');
    // Unparseable: the real fetch owns the rejection, and it must not throw
    // synchronously out of the wrapper.
    let pending: Promise<Response> | undefined;
    expect(() => {
      pending = window.fetch('http://[not-a-host');
    }).not.toThrow();
    await pending;

    expect(respond).not.toHaveBeenCalled();
    expect(realFetch.mock.calls.map(call => String(call[0]))).toEqual([
      'data:image/svg+xml,%3Csvg%2F%3E',
      'blob:http://localhost/0b8f3c1e-7a9d-4c56-9e2a-4f1d2c3b4a5e',
      'http://[not-a-host',
    ]);
  });
});

describe('showcase wallpaper (&background=1)', () => {
  const realLibraryGet = generated.backgroundLibraryGet;

  afterEach(() => {
    generated.backgroundLibraryGet = realLibraryGet;
  });

  it('stays on the default theme and the real command without the parameter', () => {
    window.history.replaceState(null, '', '/?showcase=1');
    installShowcaseMode(async () => fixtures());

    expect(window.localStorage.getItem('shiranami.theme')).toBeNull();
    expect(generated.backgroundLibraryGet).toBe(realLibraryGet);
  });

  it('selects the custom theme and answers the library from the local files', async () => {
    window.history.replaceState(null, '', '/?showcase=1&background=1');
    const record = { fileName: 'bg-showcase.gif', stillFileName: 'bg-showcase.still.webp' };
    const realFetch = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify(record), { headers: { 'content-type': 'application/json' } })
    );
    window.fetch = realFetch;

    installShowcaseMode(async () => fixtures());

    expect(window.localStorage.getItem('shiranami.theme')).toContain('"custom"');
    expect(streamUrlBase()).toBe(`${window.location.origin}/showcase-local`);
    const library = await commands.backgroundLibraryGet();
    expect(library?.activeId).toBe('showcase');
    expect(library?.entries?.[0]?.background).toEqual(record);
    expect(realFetch.mock.calls[0]?.[0]).toBe('/showcase-local/background/background.json');
  });
});

describe('freezeClock', () => {
  it('freezes only the no-argument forms', () => {
    const target = { Date: originalDate } as unknown as typeof globalThis;
    freezeClock(target);

    expect(target.Date.now()).toBe(SHOWCASE_NOW);
    expect(new target.Date().getTime()).toBe(SHOWCASE_NOW);
    expect(new target.Date(0).getTime()).toBe(0);
    expect(new target.Date(2020, 0, 2).getDate()).toBe(2);
    expect(new target.Date() instanceof originalDate).toBe(true);
    expect(target.Date.parse('1970-01-01T00:00:00Z')).toBe(0);
  });
});
