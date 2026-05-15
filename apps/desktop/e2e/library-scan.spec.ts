import { test, expect } from './fixtures';
import { createSilentAudioFiles } from './helpers/audio-fixtures';
import { rmSync } from 'node:fs';

test.describe('library scan', () => {
  test('scans a folder of WAVs and persists them via the IPC pair', async ({ page }) => {
    const { dir, files } = createSilentAudioFiles(3);
    try {
      // 1. scanFolder returns ScannedTrack[] = `{ filePath, metadata }[]` via
      //    the forked utility process. It does NOT persist — the renderer
      //    owns the addMany call, so the e2e flow mirrors the real two-step
      //    shape (scan → transform → persist).
      const scanned = await page.evaluate(async folder => {
        return (await window.electronAPI.library.scanFolder(folder)) as Array<{
          filePath: string;
          metadata: { title?: string; duration?: number };
        }>;
      }, dir);

      expect(scanned).toHaveLength(3);
      const scannedPaths = new Set(scanned.map(s => s.filePath));
      for (const file of files) {
        expect(scannedPaths.has(file.filePath)).toBe(true);
      }

      // 2. Transform ScannedTrack[] → NewTrack[] (title fallback = file basename,
      //    mirrors how the renderer's library actions normalise) and persist.
      const persistedCount = await page.evaluate(async rows => {
        const newTracks = rows.map(r => {
          const fileName = r.filePath.split(/[\\/]/).pop() ?? r.filePath;
          return {
            filePath: r.filePath,
            title: r.metadata.title ?? fileName,
            duration: r.metadata.duration ?? null,
          };
        });
        return (await window.electronAPI.db.tracks.addMany(newTracks)).length;
      }, scanned);

      expect(persistedCount).toBe(3);

      const stored = await page.evaluate(async () => {
        return await window.electronAPI.db.tracks.getAll();
      });
      expect(stored).toHaveLength(3);
      expect(stored.every(t => typeof t.title === 'string' && t.title.length > 0)).toBe(true);
      // Each stored row points back at one of the fixture WAVs.
      const storedPaths = new Set(stored.map(t => t.filePath));
      for (const file of files) {
        expect(storedPaths.has(file.filePath)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns empty array for an empty folder', async ({ page }) => {
    const { dir } = createSilentAudioFiles(0);
    try {
      const scanned = await page.evaluate(async folder => {
        return (await window.electronAPI.library.scanFolder(folder)) as unknown[];
      }, dir);
      expect(scanned).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('persists a watched folder via db.folders.add', async ({ page }) => {
    const { dir } = createSilentAudioFiles(0);
    try {
      const added = await page.evaluate(async folder => {
        return (await window.electronAPI.db.folders.add(folder)) as { id: string; path: string };
      }, dir);
      expect(added.path).toBe(dir);

      const all = await page.evaluate(async () => {
        return await window.electronAPI.db.folders.getAll();
      });
      expect(all).toHaveLength(1);
      expect(all[0].path).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
