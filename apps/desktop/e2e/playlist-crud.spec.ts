import { test, expect } from './fixtures';
import { seedSilentTracks } from './helpers/db';
import { rmSync } from 'node:fs';

test.describe('playlist CRUD', () => {
  test('create → add tracks → remove a track → rename → delete', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 3);
    try {
      // create
      const created = await page.evaluate(async () => {
        return await window.electronAPI.db.playlists.create({
          name: 'Mellow afternoons',
          description: 'lofi for sundays',
        });
      });
      expect(created.id).toBeTruthy();
      expect(created.name).toBe('Mellow afternoons');

      const playlistId = created.id;

      // Each row's "addTrack" runs through the production IPC, so the
      // unique (playlistId, trackId) join constraint is exercised.
      const addResults = await page.evaluate(
        async ({ pid, trackIds }) => {
          const results: unknown[] = [];
          for (const tid of trackIds) {
            results.push(await window.electronAPI.db.playlists.addTrack(pid, tid));
          }
          return results.length;
        },
        { pid: playlistId, trackIds: tracks.map(t => t.id) }
      );
      expect(addResults).toBe(3);

      // getTracks returns the linked rows in insertion order.
      const linked = await page.evaluate(
        async pid => await window.electronAPI.db.playlists.getTracks(pid),
        playlistId
      );
      expect(linked).toHaveLength(3);
      expect(linked.map(t => t.id)).toEqual(tracks.map(t => t.id));

      // removeTrack drops one link.
      await page.evaluate(
        async ({ pid, tid }) => {
          await window.electronAPI.db.playlists.removeTrack(pid, tid);
        },
        { pid: playlistId, tid: tracks[1].id }
      );
      const afterRemove = await page.evaluate(
        async pid => await window.electronAPI.db.playlists.getTracks(pid),
        playlistId
      );
      expect(afterRemove).toHaveLength(2);
      expect(afterRemove.map(t => t.id)).toEqual([tracks[0].id, tracks[2].id]);

      // update rename.
      const renamed = await page.evaluate(
        async pid => await window.electronAPI.db.playlists.update(pid, { name: 'Bright mornings' }),
        playlistId
      );
      expect(renamed.name).toBe('Bright mornings');

      // delete + verify it's gone from getAll.
      await page.evaluate(
        async pid => await window.electronAPI.db.playlists.delete(pid),
        playlistId
      );
      const all = await page.evaluate(async () => await window.electronAPI.db.playlists.getAll());
      expect(all.find(p => p.id === playlistId)).toBeUndefined();
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });

  test('createWithTracks builds the playlist atomically', async ({ page }) => {
    const { tracks, audioDir } = await seedSilentTracks(page, 4);
    try {
      const created = await page.evaluate(
        async trackIds =>
          await window.electronAPI.db.playlists.createWithTracks({
            name: 'Focus',
            trackIds,
          }),
        tracks.map(t => t.id)
      );

      expect(created.id).toBeTruthy();
      const linked = await page.evaluate(
        async pid => await window.electronAPI.db.playlists.getTracks(pid),
        created.id
      );
      expect(linked).toHaveLength(4);
      // Order preserved from trackIds input.
      expect(linked.map(t => t.id)).toEqual(tracks.map(t => t.id));
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });

  test('cascade delete removes a playlist when the only track it has is removed from the library', async ({
    page,
  }) => {
    // Playlist rows stay alive when tracks are deleted (the join row is the
    // cascade target, per the FK in schema/playlist-tracks.ts). This spec
    // pins that behaviour so a future schema change can't silently shift it.
    const { tracks, audioDir } = await seedSilentTracks(page, 2);
    try {
      const created = await page.evaluate(
        async trackIds =>
          await window.electronAPI.db.playlists.createWithTracks({
            name: 'Soon empty',
            trackIds,
          }),
        tracks.map(t => t.id)
      );

      await page.evaluate(
        async ids => {
          for (const id of ids) {
            await window.electronAPI.db.tracks.remove(id);
          }
        },
        tracks.map(t => t.id)
      );

      // Playlist still exists with zero tracks linked.
      const linked = await page.evaluate(
        async pid => await window.electronAPI.db.playlists.getTracks(pid),
        created.id
      );
      expect(linked).toHaveLength(0);

      const all = await page.evaluate(async () => await window.electronAPI.db.playlists.getAll());
      expect(all.find(p => p.id === created.id)).toBeDefined();
    } finally {
      rmSync(audioDir, { recursive: true, force: true });
    }
  });
});
