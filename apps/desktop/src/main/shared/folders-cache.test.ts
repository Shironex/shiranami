import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import * as path from 'node:path';
import { closeDatabase, initializeDatabase, getDatabase } from '@shiranami/database/client';
import { folders, tracks } from '@shiranami/database';
import { makeTempDir, cleanupTempDir } from '../../../test/setup';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock `app.getPath('music')` and `app.getPath('userData')` so the cache
// builds against well-known, OS-correct paths.
const MOCK_USER_DATA = path.resolve('/mock/userData');
const MOCK_MUSIC = path.resolve('/mock/music');

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((key: string) => {
      if (key === 'userData') return MOCK_USER_DATA;
      if (key === 'music') return MOCK_MUSIC;
      return '/mock/unknown';
    }),
  },
}));

const mockStore = {
  get: vi.fn<(key: string) => unknown>(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock('../store', () => ({
  store: {
    get: (...args: unknown[]) => mockStore.get(args[0] as string),
    set: (...args: unknown[]) => mockStore.set(...args),
    delete: (...args: unknown[]) => mockStore.delete(...args),
  },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { getAllowedRoots, invalidate, isPathAllowed } = await import('./folders-cache');

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('folders-cache', () => {
  let tempDir: string;

  beforeEach(() => {
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'cache-test.sqlite') });
    invalidate();
    vi.clearAllMocks();
    mockStore.get.mockReturnValue(undefined);
  });

  afterEach(() => {
    closeDatabase();
    cleanupTempDir(tempDir);
    invalidate();
  });

  /* ------------------------------------------------------------------ */
  /*  getAllowedRoots                                                    */
  /* ------------------------------------------------------------------ */

  describe('getAllowedRoots', () => {
    it('returns userData + default download dir when no folders are registered', () => {
      const roots = getAllowedRoots();
      // Lowercased on darwin/win32 by normalizePathForCompare.
      const expectUserData =
        process.platform === 'linux' ? MOCK_USER_DATA : MOCK_USER_DATA.toLowerCase();
      const expectDownloads = path.join(MOCK_MUSIC, 'Shiranami Downloads');
      const expectDownloadsNorm =
        process.platform === 'linux' ? expectDownloads : expectDownloads.toLowerCase();

      expect(roots).toContain(expectUserData);
      expect(roots).toContain(expectDownloadsNorm);
    });

    it('includes folder rows from the DB', () => {
      const folderPath = path.resolve('/mock/library/music');
      getDatabase().insert(folders).values({ id: crypto.randomUUID(), path: folderPath }).run();

      const roots = getAllowedRoots();
      const expected = process.platform === 'linux' ? folderPath : folderPath.toLowerCase();
      expect(roots).toContain(expected);
    });

    it('respects the configured download.location override', () => {
      const custom = path.resolve('/mock/custom-downloads');
      mockStore.get.mockImplementation((key: string) =>
        key === 'downloads.location' ? custom : undefined
      );

      const roots = getAllowedRoots();
      const expected = process.platform === 'linux' ? custom : custom.toLowerCase();
      expect(roots).toContain(expected);
    });

    it('caches the result — subsequent calls do not re-query the DB', () => {
      // Insert a folder, prime the cache.
      const folderPath = path.resolve('/mock/library/a');
      getDatabase().insert(folders).values({ id: crypto.randomUUID(), path: folderPath }).run();
      const first = getAllowedRoots();

      // Insert a second folder — without invalidate(), the new one should
      // NOT appear (cache stale by design).
      const folderB = path.resolve('/mock/library/b');
      getDatabase().insert(folders).values({ id: crypto.randomUUID(), path: folderB }).run();
      const second = getAllowedRoots();

      expect(second).toEqual(first);
      const expectedB = process.platform === 'linux' ? folderB : folderB.toLowerCase();
      expect(second).not.toContain(expectedB);
    });

    it('invalidate() forces a rebuild', () => {
      getAllowedRoots(); // prime
      const folderPath = path.resolve('/mock/library/late');
      getDatabase().insert(folders).values({ id: crypto.randomUUID(), path: folderPath }).run();
      invalidate();
      const refreshed = getAllowedRoots();
      const expected = process.platform === 'linux' ? folderPath : folderPath.toLowerCase();
      expect(refreshed).toContain(expected);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  isPathAllowed                                                      */
  /* ------------------------------------------------------------------ */

  describe('isPathAllowed', () => {
    it('accepts a path inside an allowed folder root', async () => {
      const folderPath = path.resolve('/mock/library/music');
      getDatabase().insert(folders).values({ id: crypto.randomUUID(), path: folderPath }).run();

      const inside = path.join(folderPath, 'sub', 'song.mp3');
      await expect(isPathAllowed(inside)).resolves.toBe(true);
    });

    it('accepts a known track path even when outside every allowed root', async () => {
      const standaloneFile = path.resolve('/somewhere/else/standalone.mp3');
      getDatabase()
        .insert(tracks)
        .values({
          id: crypto.randomUUID(),
          filePath: standaloneFile,
          title: 'Standalone',
          artist: 'X',
        })
        .run();

      await expect(isPathAllowed(standaloneFile)).resolves.toBe(true);
    });

    it('rejects a path outside roots and not present in the tracks table', async () => {
      await expect(isPathAllowed('/etc/passwd')).resolves.toBe(false);
    });

    it('returns false when the database call throws (fail-closed)', async () => {
      // Close the DB to make getDatabase() throw on the tracks fallback.
      closeDatabase();
      // Path outside roots so we hit the fallback path.
      await expect(isPathAllowed('/totally/unknown/file.mp3')).resolves.toBe(false);
    });

    it('rejects a symlink inside an allowed root that points outside', async () => {
      // realpath resolution must catch this — without it, textual containment
      // would pass but the downstream stat would happily serve the secret file.
      const allowedRoot = fs.realpathSync(makeTempDir());
      const outside = fs.realpathSync(makeTempDir());
      const secret = path.join(outside, 'secret.mp3');
      fs.writeFileSync(secret, 'x');
      const link = path.join(allowedRoot, 'shortcut.mp3');
      try {
        fs.symlinkSync(secret, link);
      } catch {
        // Windows without elevation — skip.
        return;
      }

      getDatabase().insert(folders).values({ id: crypto.randomUUID(), path: allowedRoot }).run();
      invalidate();

      await expect(isPathAllowed(link)).resolves.toBe(false);

      fs.rmSync(allowedRoot, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    });

    it('caches a positive authorization so a repeat check skips the DB lookup', async () => {
      const standaloneFile = path.resolve('/cached/standalone.mp3');
      getDatabase()
        .insert(tracks)
        .values({
          id: crypto.randomUUID(),
          filePath: standaloneFile,
          title: 'Cached',
          artist: 'X',
        })
        .run();

      // First check authorizes via the tracks fallback and caches the grant.
      await expect(isPathAllowed(standaloneFile)).resolves.toBe(true);

      // Delete the row: an uncached check would now fail (outside every root,
      // no tracks row). The cached grant keeps the repeat check positive.
      getDatabase().delete(tracks).run();
      await expect(isPathAllowed(standaloneFile)).resolves.toBe(true);
    });

    it('invalidate() clears the positive-authorization cache', async () => {
      const standaloneFile = path.resolve('/cached/cleared.mp3');
      getDatabase()
        .insert(tracks)
        .values({
          id: crypto.randomUUID(),
          filePath: standaloneFile,
          title: 'Cleared',
          artist: 'X',
        })
        .run();

      await expect(isPathAllowed(standaloneFile)).resolves.toBe(true);

      // Drop the row and invalidate — the now-stale grant must be gone, so the
      // re-authorization fails closed.
      getDatabase().delete(tracks).run();
      invalidate();
      await expect(isPathAllowed(standaloneFile)).resolves.toBe(false);
    });

    it('never caches a negative result', async () => {
      const unknown = path.resolve('/never/cached/denied.mp3');
      await expect(isPathAllowed(unknown)).resolves.toBe(false);

      // Insert a matching track AFTER the denial. If negatives were cached the
      // path would stay denied; because they are not, the new row is honored.
      getDatabase()
        .insert(tracks)
        .values({ id: crypto.randomUUID(), filePath: unknown, title: 'Now Known', artist: 'X' })
        .run();
      await expect(isPathAllowed(unknown)).resolves.toBe(true);
    });

    it('matches a known track when the renderer sends a path with collapsible segments', async () => {
      // toAudioUrl forwards the renderer's path verbatim; on Windows it also
      // forces forward slashes. path.resolve in the DB-lookup branch normalizes
      // both, so a row stored as `.../standalone.mp3` still matches when the
      // renderer asks for `.../foo/../standalone.mp3`.
      const stored = path.resolve('/somewhere/else/standalone.mp3');
      getDatabase()
        .insert(tracks)
        .values({
          id: crypto.randomUUID(),
          filePath: stored,
          title: 'Standalone',
          artist: 'X',
        })
        .run();

      const messy = '/somewhere/else/foo/../standalone.mp3';
      await expect(isPathAllowed(messy)).resolves.toBe(true);
    });
  });
});
