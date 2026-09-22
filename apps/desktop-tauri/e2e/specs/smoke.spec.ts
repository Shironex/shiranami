/**
 * The suite's canary: the app boots, the §2.6 shim is installed, the E2E store
 * registry comes online, and the profile it opened is the isolated one.
 *
 * Ported from `apps/desktop/e2e/smoke.spec.ts`. The `electronApp.windows()`
 * assertion is dropped — a WebDriver session already implies a window, and there
 * is no main-process handle to ask.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { readLog, waitForLogLine } from '../helpers/logs.js';

const HOME = profile('library').home;

describe('smoke', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
  });

  it('exposes the shim with a platform string', async () => {
    const platform = await browser.execute(() => window.electronAPI.platform);
    expect(platform).toBe('darwin');
  });

  it('reports the E2E harness to the renderer', async () => {
    // `__SHIRANAMI_E2E__` -> `isE2eHarness()` -> `electronAPI.__e2e`. Phase 17
    // found the init script had no caller at all, so this is a real regression
    // guard, not a tautology.
    const flags = await browser.execute(() => ({
      global: (window as unknown as { __SHIRANAMI_E2E__?: boolean }).__SHIRANAMI_E2E__,
      bridge: window.electronAPI.__e2e,
      stores: Object.keys(window.__shiranami?.stores ?? {}).sort(),
    }));

    expect(flags.global).toBe(true);
    expect(flags.bridge).toBe(true);
    expect(flags.stores).toEqual([
      'eq',
      'library',
      'playback',
      'playlistImport',
      'selection',
      'ui',
      'view',
    ]);
  });

  it('suppresses the first-run wizard under SHIRANAMI_E2E', async () => {
    // Pinned deliberately: `App.tsx` seeds `onboardingDone` with `IS_E2E`, and
    // the whole `library` capability depends on landing on the shell. The
    // `onboarding` capability covers the other half of this behaviour.
    const wizard = await browser.$('div[role="dialog"][aria-modal="true"]');
    expect(await wizard.isExisting()).toBe(false);
    expect(await (await browser.$('#app-sidebar')).isExisting()).toBe(true);
  });

  it('opened the isolated profile, not the developer’s', async () => {
    const line = await waitForLogLine(HOME, 'shiranami starting');
    expect(line).toContain(`data_dir=${HOME}`);
    expect(line).toContain('e2e=true');

    // The v1 tree lives under a different `HOME`, so continuity has nothing to
    // find and must say so rather than adopting anything.
    expect(readLog(HOME)).toContain('first-run data continuity');
  });

  it('starts the E2E profile with an empty library', async () => {
    const counts = await browser.execute(async () => ({
      tracks: (await window.electronAPI.db.tracks.getAll()).length,
      playlists: (await window.electronAPI.db.playlists.getAll()).length,
      folders: (await window.electronAPI.db.folders.getAll()).length,
    }));

    expect(counts).toEqual({ tracks: 0, playlists: 0, folders: 0 });
  });

  it('brought the loopback media server up', async () => {
    await waitForLogLine(HOME, 'the loopback media server is listening');

    const info = await browser.execute(async () =>
      (
        window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string) => Promise<unknown> } }
      ).__TAURI_INTERNALS__.invoke('serve_info')
    );

    expect(info).toEqual(
      expect.objectContaining({ origin: expect.stringContaining('http://127.0.0.1:') })
    );
  });
});
