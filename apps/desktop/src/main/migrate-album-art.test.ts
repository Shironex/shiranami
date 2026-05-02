import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { closeDatabase, initializeDatabase } from '@shiranami/database/client';
import { makeTempDir, cleanupTempDir } from '../../test/setup';

vi.mock('./art-protocol', () => ({
  saveAlbumArt: vi.fn(async () => 'shiranami-art://migrated-hash'),
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./store', () => ({
  store: {
    get: vi.fn(() => false),
    set: vi.fn(),
  },
}));

import { migrateAlbumArtToDisk } from './migrate-album-art';
import { saveAlbumArt } from './art-protocol';
import { logger } from './logger';
import { store } from './store';
import { tracks, eq } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';

/** Minimal valid JPEG base64 (1x1 pixel). */
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAA' +
  'AAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMR' +
  'AD8AKwA//9k=';

function makeDataUrl(mime: string, b64: string): string {
  return `data:${mime};base64,${b64}`;
}

describe('migrateAlbumArtToDisk (integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    closeDatabase();
    tempDir = makeTempDir();
    initializeDatabase({ path: join(tempDir, 'app.sqlite') });
  });

  afterEach(() => {
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  function insertTrack(overrides: Record<string, unknown> = {}) {
    const db = getDatabase();
    const id = crypto.randomUUID();
    db.insert(tracks)
      .values({
        id,
        filePath: `/music/${id}.mp3`,
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 200,
        ...overrides,
      })
      .run();
    return id;
  }

  function getTrackAlbumArt(id: string): string | null {
    const db = getDatabase();
    const row = db
      .select({ albumArt: tracks.albumArt })
      .from(tracks)
      .where(eq(tracks.id, id))
      .get();
    return row?.albumArt ?? null;
  }

  /* ------------------------------------------------------------------ */
  /*  Tests                                                              */
  /* ------------------------------------------------------------------ */

  it('returns early without querying the database when albumArtV1 flag is already set', async () => {
    vi.mocked(store.get).mockReturnValueOnce(true as never);
    insertTrack({ albumArt: makeDataUrl('image/jpeg', TINY_JPEG_B64) });

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it('sets albumArtV1 flag to true after a successful migration run', async () => {
    const dataUrl = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    insertTrack({ albumArt: dataUrl });

    await migrateAlbumArtToDisk();

    expect(store.set).toHaveBeenCalledOnce();
    expect(store.set).toHaveBeenCalledWith('migrations.albumArtV1', true);
  });

  it('sets albumArtV1 flag to true even when there is nothing to migrate', async () => {
    insertTrack({ albumArt: null });

    await migrateAlbumArtToDisk();

    expect(store.set).toHaveBeenCalledOnce();
    expect(store.set).toHaveBeenCalledWith('migrations.albumArtV1', true);
  });

  it('terminates the loop when saveAlbumArt permanently returns falsy (no infinite loop)', async () => {
    const dataUrl = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    insertTrack({ albumArt: dataUrl });

    // Returns falsy once — row is nulled out and loop must terminate (not re-fetch).
    vi.mocked(saveAlbumArt).mockResolvedValueOnce('' as never);

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0 migrated, 1 failed'));
    expect(store.set).toHaveBeenCalledWith('migrations.albumArtV1', true);
  });

  it('migrates tracks with valid base64 data URLs to shiranami-art:// URLs', async () => {
    const dataUrl = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    const id = insertTrack({ albumArt: dataUrl });

    await migrateAlbumArtToDisk();

    const updatedArt = getTrackAlbumArt(id);
    expect(updatedArt).toBe('shiranami-art://migrated-hash');
    expect(saveAlbumArt).toHaveBeenCalledOnce();
    expect(saveAlbumArt).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1 migrated, 0 failed'));
  });

  it('skips tracks that already have shiranami-art:// URLs (idempotency)', async () => {
    const id = insertTrack({ albumArt: 'shiranami-art://existing-hash' });

    await migrateAlbumArtToDisk();

    const art = getTrackAlbumArt(id);
    expect(art).toBe('shiranami-art://existing-hash');
    expect(saveAlbumArt).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('No base64 album art to migrate')
    );
  });

  it('handles invalid/malformed data URLs gracefully', async () => {
    insertTrack({ albumArt: 'data:not-a-valid-data-url' });

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid data URL'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0 migrated, 1 failed'));
  });

  it('handles null albumArt rows without crashing', async () => {
    insertTrack({ albumArt: null });

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('No base64 album art to migrate')
    );
  });

  it('returns without error when database has no base64 tracks', async () => {
    insertTrack({ albumArt: null });
    insertTrack({ albumArt: 'shiranami-art://hash1' });
    insertTrack({ albumArt: 'https://example.com/cover.jpg' });

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('No base64 album art to migrate')
    );
  });

  it('reports correct migrated/failed/skipped counts', async () => {
    const validJpeg = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    const validPng = makeDataUrl('image/png', TINY_JPEG_B64);

    insertTrack({ albumArt: validJpeg });
    insertTrack({ albumArt: validPng });
    insertTrack({ albumArt: 'data:garbage-no-base64' });
    insertTrack({ albumArt: 'shiranami-art://already-done' });
    insertTrack({ albumArt: null });

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('2 migrated, 1 failed'));
  });

  it('handles saveAlbumArt returning falsy (failed save)', async () => {
    const dataUrl = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    const id = insertTrack({ albumArt: dataUrl });

    vi.mocked(saveAlbumArt).mockResolvedValueOnce('' as never);

    await migrateAlbumArtToDisk();

    // Row is nulled out on failure so it is not re-fetched.
    const art = getTrackAlbumArt(id);
    expect(art).toBeNull();
    expect(saveAlbumArt).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0 migrated, 1 failed'));
  });

  it('handles saveAlbumArt throwing an error', async () => {
    const dataUrl = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    const id = insertTrack({ albumArt: dataUrl });

    vi.mocked(saveAlbumArt).mockRejectedValueOnce(new Error('disk full'));

    await migrateAlbumArtToDisk();

    // Row is nulled out on error so it is not re-fetched.
    const art = getTrackAlbumArt(id);
    expect(art).toBeNull();
    expect(saveAlbumArt).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to migrate track'),
      expect.any(Error)
    );
  });

  it('processes more tracks than BATCH_SIZE', async () => {
    const dataUrl = makeDataUrl('image/jpeg', TINY_JPEG_B64);
    for (let i = 0; i < 55; i++) {
      insertTrack({ albumArt: dataUrl });
    }

    await migrateAlbumArtToDisk();

    expect(saveAlbumArt).toHaveBeenCalledTimes(55);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('55 migrated, 0 failed'));
  });
});
