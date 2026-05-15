import { test, expect } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test.describe('settings persistence across restart', () => {
  test('electron-store survives a quit + relaunch under the same userDataDir', async () => {
    // Own the userDataDir lifecycle so both launches share state. The default
    // fixture mints fresh dirs per test (correct for isolation, wrong here).
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'shiranami-e2e-persist-'));
    try {
      // ── First launch — set values via the renderer-facing store IPC.
      // `theme` and `app.language` are written-only-on-user-action, so they
      // don't get re-synced by a startup effect (unlike player.volume, which
      // a useEffect in usePlaybackStore would overwrite back to the default
      // when zustand hydrates after our set). That property is what makes
      // them safe targets for a "settings persistence" assertion.
      const first = await launchApp({ userDataDir });
      try {
        await first.page.evaluate(async () => {
          await window.electronAPI.store.set('theme', 'light');
          await window.electronAPI.store.set('app.language', 'pl');
        });

        const written = await first.page.evaluate(async () => ({
          theme: await window.electronAPI.store.get('theme'),
          language: await window.electronAPI.store.get('app.language'),
        }));
        expect(written.theme).toBe('light');
        expect(written.language).toBe('pl');
      } finally {
        await first.close();
      }

      // ── Second launch — same userDataDir, expect the values to survive.
      const second = await launchApp({ userDataDir });
      try {
        const restored = await second.page.evaluate(async () => ({
          theme: await window.electronAPI.store.get('theme'),
          language: await window.electronAPI.store.get('app.language'),
        }));
        expect(restored.theme).toBe('light');
        expect(restored.language).toBe('pl');
      } finally {
        await second.close();
      }
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('sqlite rows (playlists) survive a quit + relaunch', async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'shiranami-e2e-persist-db-'));
    try {
      let createdPlaylistId = '';

      const first = await launchApp({ userDataDir });
      try {
        createdPlaylistId = await first.page.evaluate(async () => {
          const playlist = await window.electronAPI.db.playlists.create({ name: 'survives' });
          return playlist.id;
        });
        expect(createdPlaylistId).toBeTruthy();
      } finally {
        await first.close();
      }

      const second = await launchApp({ userDataDir });
      try {
        const surviving = await second.page.evaluate(async () => {
          return await window.electronAPI.db.playlists.getAll();
        });
        expect(surviving.length).toBe(1);
        expect(surviving[0].id).toBe(createdPlaylistId);
        expect(surviving[0].name).toBe('survives');
      } finally {
        await second.close();
      }
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
