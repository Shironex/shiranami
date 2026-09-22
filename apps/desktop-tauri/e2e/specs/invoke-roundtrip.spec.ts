/**
 * The §2.6 shim over a real `invoke`, in both directions.
 *
 * Every other spec in this capability reaches the backend through
 * `window.electronAPI`, so this one exists to prove the transport itself rather
 * than any feature built on it: a value written from the renderer reaches Rust,
 * is persisted by `core::store`, and is readable both from a later `invoke` and
 * from the file on disk. The disk half is the part a unit test cannot fake.
 *
 * It also pins the *refusal* path. `store_get` takes a `RendererStoreKey`, and
 * the renderer's own `storeApi` widens every key back to `string` on the way in
 * (`namespaces/store.ts` documents that as deliberate). So the only thing
 * standing between a typo and a silently-accepted junk key is the backend's
 * allowlist, and an E2E run is the only place both halves are real.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell } from '../helpers/app.js';
import { profile, settingsValue } from '../helpers/profile.js';

const HOME = profile('library').home;

describe('invoke roundtrip', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  it('answers a command with a typed value', async () => {
    const version = await browser.execute(async () => window.electronAPI.app.getVersion());

    // `tauri.conf.json`'s `version`, which `app_get_version` reads from the
    // baked config rather than from `package.json`.
    expect(version).toBe('2.0.0-alpha.0');
  });

  it('persists a renderer write through to the settings file', async () => {
    await browser.execute(async () => {
      await window.electronAPI.store.set('player.volume', 0.42);
    });

    // Back through the IPC first: proves the backend's own read path agrees
    // with what it just wrote, without going near the disk.
    const readBack = await browser.execute(async () =>
      window.electronAPI.store.get<number>('player.volume')
    );
    expect(readBack).toBe(0.42);

    // Then the file. `core::store` writes on a debounce, so this is polled
    // rather than asserted once — a value that has not landed yet is not the
    // same failure as a value that landed wrong.
    await browser.waitUntil(() => settingsValue(HOME, 'player.volume') === 0.42, {
      timeout: 10_000,
      timeoutMsg: `player.volume never reached config.json (saw ${JSON.stringify(
        settingsValue(HOME, 'player.volume')
      )})`,
    });
  });

  it('round-trips a nested key without flattening it', async () => {
    // electron-store's `accessPropertiesByDotNotation` was on by default in v1
    // and `core::store::document` reproduces it, so `app.language` is a nested
    // object on disk and *not* a literal `"app.language"` property. A backend
    // that stored it flat would still satisfy the IPC read above, which is why
    // this asserts the shape rather than only the value.
    await browser.execute(async () => {
      await window.electronAPI.store.set('app.language', 'pl');
    });

    await browser.waitUntil(() => settingsValue(HOME, 'app.language') === 'pl', {
      timeout: 10_000,
      timeoutMsg: 'app.language never reached config.json',
    });

    // Put it back — the rest of the capability's specs share this profile and
    // an unexpected UI language would break every text-based assertion.
    await browser.execute(async () => {
      await window.electronAPI.store.set('app.language', 'en');
    });
    await browser.waitUntil(() => settingsValue(HOME, 'app.language') === 'en', {
      timeout: 10_000,
      timeoutMsg: 'app.language was not restored to en',
    });
  });

  it('deletes a key rather than storing null', async () => {
    await browser.execute(async () => {
      await window.electronAPI.store.set('app.supportBannerSeen', true);
    });
    await browser.waitUntil(() => settingsValue(HOME, 'app.supportBannerSeen') === true, {
      timeout: 10_000,
      timeoutMsg: 'app.supportBannerSeen was never written',
    });

    await browser.execute(async () => {
      await window.electronAPI.store.delete('app.supportBannerSeen');
    });

    // `null`, not `undefined` — and that is worth stating rather than smoothing
    // over, because `storeApi.get` is *typed* `Promise<T | undefined>`.
    //
    // `bridge/wire.ts` enumerates the channels that convert a Tauri `null` back
    // to v1's `undefined` — "the four `db:tracks` upserts, the two `db:folders`
    // writes, the four `db:playlists` writes, and nothing else" — and `store_get`
    // is deliberately not among them. electron-store answered a missing key with
    // `undefined`, so this is a twelfth channel whose return value changed and
    // did not get the treatment; the type still claims otherwise.
    //
    // Nothing is broken by it today: every caller narrows with `typeof x ===
    // 'number'`, `=== true` or `?? fallback`, all of which read `null` and
    // `undefined` identically. So this asserts what the transport really does,
    // and exists to make the discrepancy fail loudly if someone later "fixes"
    // one side without the other.
    const afterDelete = await browser.execute(async () =>
      window.electronAPI.store.get<boolean>('app.supportBannerSeen')
    );
    expect(afterDelete).toBeNull();

    await browser.waitUntil(() => settingsValue(HOME, 'app.supportBannerSeen') === undefined, {
      timeout: 10_000,
      timeoutMsg: 'app.supportBannerSeen was still present in config.json after delete',
    });
  });

  it('refuses a key outside the allowlist instead of storing it', async () => {
    const outcome = await browser.execute(async () => {
      try {
        await window.electronAPI.store.set('totally-not-a-key', 1);
        return { rejected: false, message: '' };
      } catch (error) {
        return {
          rejected: true,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });

    expect(outcome.rejected).toBe(true);
    // The shim surfaces the backend's `BAD_REQUEST`; the exact prose is the
    // backend's, so this asserts the classification rather than the sentence.
    expect(outcome.message).toMatch(/BAD_REQUEST|bad request|invalid|unknown key/i);

    expect(settingsValue(HOME, 'totally-not-a-key')).toBeUndefined();
  });
});
