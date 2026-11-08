import type { SQLiteDatabase } from 'expo-sqlite';
import type { AudioLibraryModule, MediaAudio, TrackTags } from '@/modules/audio-library';
import { MIGRATIONS, migrateDbIfNeeded } from '@/lib/db';
import { loadLibrary } from '@/lib/library';
import {
  backfillHashes,
  describeScan,
  importPicked,
  planScan,
  READ_BATCH,
  scanLibrary,
  withLibraryLock,
  type KnownRow,
  type LibraryDeps,
} from '@/lib/library-scan';
import { openTestDb } from './support/sqlite';

function tags(hash: string, extra: Partial<TrackTags> = {}): TrackTags {
  return {
    contentHash: `a1:${hash}`,
    size: 1000,
    title: null,
    artist: null,
    album: null,
    albumArtist: null,
    trackNumber: null,
    year: null,
    genre: null,
    durationMs: null,
    artUri: null,
    ...extra,
  };
}

function media(id: number, extra: Partial<MediaAudio> = {}): MediaAudio {
  return {
    uri: `content://media/external/audio/media/${id}`,
    name: `Artist ${id} - Song ${id}.mp3`,
    size: 1000,
    modified: 100,
    mimeType: 'audio/mpeg',
    ...extra,
  };
}

/** A fake native module: what MediaStore lists, and what each uri reads as. */
function fakeNative(files: Map<string, TrackTags | null>, listed: MediaAudio[] = []) {
  const native = {
    getPermissionAsync: jest.fn(),
    requestPermissionAsync: jest.fn(),
    queryAudioAsync: jest.fn(async () => listed),
    readTracksAsync: jest.fn(async (uris: string[]) => uris.map(uri => files.get(uri) ?? null)),
  };
  return native as typeof native & AudioLibraryModule;
}

function deps(native: AudioLibraryModule | null): LibraryDeps & { removed: string[] } {
  const removed: string[] = [];
  return {
    native,
    artDir: 'file:///art/',
    copyIn: (_source, name) => `file:///tracks/${name}`,
    removeCopy: uri => removed.push(uri),
    removed,
  };
}

async function freshDb(): Promise<SQLiteDatabase & { close: () => void }> {
  const db = openTestDb();
  await migrateDbIfNeeded(db);
  return db;
}

const rows = (db: SQLiteDatabase) =>
  db.getAllAsync<KnownRow & { title: string; artist: string; album: string; duration: number }>(
    'SELECT * FROM tracks ORDER BY file_path'
  );

describe('migration 2', () => {
  it('adds the identity columns to an install that has only migration 1, keeping its rows', async () => {
    const db = openTestDb();
    await db.execAsync(
      "CREATE TABLE _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
    );
    for (const sql of MIGRATIONS[1]) await db.execAsync(sql);
    await db.runAsync('INSERT INTO _migrations (version) VALUES (1)');
    await db.runAsync(
      "INSERT INTO tracks (id, file_path, title, artist) VALUES ('old', 'file:///tracks/x.mp3', 'Old', 'Someone')"
    );

    await migrateDbIfNeeded(db);
    await migrateDbIfNeeded(db); // idempotent

    const [row] = await rows(db);
    expect(row).toMatchObject({
      id: 'old',
      title: 'Old',
      content_hash: null,
      source: 'import',
      missing: 0,
    });
    const versions = await db.getAllAsync<{ version: number }>('SELECT version FROM _migrations');
    expect(versions.map(v => v.version)).toEqual([1, 2, 3]);
  });
});

describe('backfillHashes', () => {
  it('hashes old rows and fills tags, keeping the old title where the file has none', async () => {
    const db = await freshDb();
    await db.runAsync(
      "INSERT INTO tracks (id, file_path, title, artist) VALUES ('a', 'file:///tracks/a.mp3', 'From Name', 'Name Artist'), ('b', 'file:///tracks/b.mp3', 'Keep Me', 'Keep Artist'), ('c', 'file:///tracks/gone.mp3', 'Gone', 'X')"
    );
    const native = fakeNative(
      new Map([
        [
          'file:///tracks/a.mp3',
          tags('aaa', { title: 'Tagged', album: 'Album', durationMs: 125000 }),
        ],
        ['file:///tracks/b.mp3', tags('bbb')],
      ])
    );

    expect(await backfillHashes(db, deps(native))).toBe(2);
    const [a, b, c] = await rows(db);
    expect(a).toMatchObject({
      content_hash: 'a1:aaa',
      title: 'Tagged',
      artist: 'Name Artist',
      album: 'Album',
      duration: 125,
    });
    expect(b).toMatchObject({ content_hash: 'a1:bbb', title: 'Keep Me', artist: 'Keep Artist' });
    expect(c.content_hash).toBeNull();
  });

  it('does nothing without the native module', async () => {
    const db = await freshDb();
    expect(await backfillHashes(db, deps(null))).toBe(0);
  });
});

describe('importPicked', () => {
  it('skips a file whose content hash is already in the library, without copying it', async () => {
    const db = await freshDb();
    const files = new Map([
      ['content://picked/1', tags('one', { title: 'One', artist: 'A' })],
      ['content://picked/2', tags('one')],
      ['content://picked/3', tags('three')],
    ]);
    const d = deps(fakeNative(files));
    const copy = jest.spyOn(d, 'copyIn');

    const first = await importPicked(db, d, [
      { uri: 'content://picked/1', name: 'x.flac' },
      { uri: 'content://picked/2', name: 'same song.flac' },
    ]);
    const second = await importPicked(db, d, [
      { uri: 'content://picked/1', name: 'x.flac' },
      { uri: 'content://picked/3', name: 'Band - Three.mp3' },
    ]);

    expect(first).toEqual({ added: 1, skipped: 1 });
    expect(second).toEqual({ added: 1, skipped: 1 });
    expect(copy).toHaveBeenCalledTimes(2);
    const library = await loadLibrary(db);
    expect(library.map(t => [t.title, t.artist, t.filePath]).sort()).toEqual([
      ['One', 'A', 'file:///tracks/one.flac'],
      ['Three', 'Band', 'file:///tracks/three.mp3'],
    ]);
  });

  it('falls back to the filename when the file cannot be read', async () => {
    const db = await freshDb();
    const result = await importPicked(db, deps(null), [
      { uri: 'content://picked/9', name: 'Nujabes - Aruarian Dance.mp3' },
    ]);
    expect(result).toEqual({ added: 1, skipped: 0 });
    const [track] = await loadLibrary(db);
    expect(track).toMatchObject({
      title: 'Aruarian Dance',
      artist: 'Nujabes',
      album: 'Unknown Album',
    });
  });
});

describe('planScan', () => {
  const row = (id: string, uri: string, extra: Partial<KnownRow> = {}): KnownRow => ({
    id,
    file_path: uri,
    content_hash: `a1:${id}`,
    file_size: 1000,
    file_modified: 100,
    source: 'device',
    missing: 0,
    ...extra,
  });

  it('sorts files into added, changed, unchanged and missing', () => {
    const plan = planScan(
      [
        row('same', media(1).uri),
        row('resized', media(2).uri),
        row('unhashed', media(3).uri, { content_hash: null }),
        row('back', media(4).uri, { missing: 1 }),
        row('gone', media(5).uri),
        row('imported', 'file:///tracks/x.mp3', { source: 'import' }),
      ],
      [media(1), media(2, { size: 2000 }), media(3), media(4), media(6)]
    );
    expect(plan.added.map(m => m.uri)).toEqual([media(6).uri]);
    expect(plan.changed.map(c => c.id)).toEqual(['resized', 'unhashed', 'back']);
    expect(plan.unchanged).toBe(1);
    expect(plan.missing).toEqual(['gone']);
  });
});

describe('scanLibrary', () => {
  it('adds device files in place, with tags first and the filename as fallback', async () => {
    const db = await freshDb();
    const native = fakeNative(
      new Map([
        [
          media(1).uri,
          tags('h1', {
            title: 'Tagged',
            artist: 'Band',
            album: 'LP',
            artUri: 'file:///art/h1.jpg',
            durationMs: 61000,
          }),
        ],
        [media(2).uri, tags('h2')],
      ]),
      [media(1), media(2)]
    );

    const result = await scanLibrary(db, { ...deps(native), native });

    expect(result).toMatchObject({ found: 2, added: 2, failed: 0, cancelled: false });
    const library = await loadLibrary(db);
    expect(
      library.map(t => [t.title, t.artist, t.album, t.albumArt ?? null, t.duration]).sort()
    ).toEqual([
      ['Song 2', 'Artist 2', 'Unknown Album', null, 0],
      ['Tagged', 'Band', 'LP', 'file:///art/h1.jpg', 61],
    ]);
  });

  it('on rescan adds new files, re-reads changed ones, marks missing ones and follows moves', async () => {
    const db = await freshDb();
    const files = new Map<string, TrackTags | null>([
      [media(1).uri, tags('h1', { title: 'One' })],
      [media(2).uri, tags('h2', { title: 'Two' })],
      [media(3).uri, tags('h3', { title: 'Three' })],
    ]);
    const native = fakeNative(files, [media(1), media(2), media(3)]);
    await scanLibrary(db, { ...deps(native), native });
    await db.runAsync('UPDATE tracks SET is_favorite = 1 WHERE content_hash = ?', ['a1:h3']);

    // 1 is retagged in place, 2 is deleted, 3 moves to a new id, 4 is new.
    files.set(media(1).uri, tags('h1', { title: 'One (Remaster)' }));
    files.set(media(30).uri, tags('h3', { title: 'Three' }));
    files.set(media(4).uri, tags('h4', { title: 'Four' }));
    native.queryAudioAsync.mockResolvedValue([media(1, { modified: 200 }), media(30), media(4)]);
    native.readTracksAsync.mockClear();

    const result = await scanLibrary(db, { ...deps(native), native });

    expect(result).toMatchObject({ added: 1, updated: 1, moved: 1, missing: 1 });
    const read = native.readTracksAsync.mock.calls.flatMap(([uris]) => uris);
    expect(read.sort()).toEqual([media(1).uri, media(30).uri, media(4).uri].sort());
    const library = await loadLibrary(db);
    expect(library.map(t => t.title).sort()).toEqual(['Four', 'One (Remaster)', 'Three']);
    expect(library.find(t => t.title === 'Three')).toMatchObject({
      filePath: media(30).uri,
      isFavorite: true,
    });
    const all = await rows(db);
    expect(all.find(r => r.content_hash === 'a1:h2')?.missing).toBe(1);

    // The deleted file comes back: same row, shown again.
    native.queryAudioAsync.mockResolvedValue([
      media(1, { modified: 200 }),
      media(30),
      media(4),
      media(2),
    ]);
    const back = await scanLibrary(db, { ...deps(native), native });
    expect(back).toMatchObject({ added: 0, updated: 1 });
    expect((await loadLibrary(db)).length).toBe(4);
  });

  it('replaces an imported copy with the same song found on the phone, and skips device duplicates', async () => {
    const db = await freshDb();
    const files = new Map<string, TrackTags | null>([
      ['content://picked/1', tags('h1', { title: 'One' })],
      [media(1).uri, tags('h1', { title: 'One' })],
      [media(2).uri, tags('h1', { title: 'One' })],
    ]);
    const native = fakeNative(files, [media(1), media(2)]);
    const d = deps(native);
    await importPicked(db, d, [{ uri: 'content://picked/1', name: 'one.mp3' }]);
    await db.runAsync('UPDATE tracks SET play_count = 7');

    const result = await scanLibrary(db, { ...d, native });

    expect(result).toMatchObject({ added: 0, moved: 1, duplicates: 1 });
    const library = await loadLibrary(db);
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({ filePath: media(1).uri, playCount: 7 });
    expect(d.removed).toEqual(['file:///tracks/h1.mp3']);
  });

  it('stops between batches when cancelled, and reports progress', async () => {
    const db = await freshDb();
    const listed = Array.from({ length: READ_BATCH * 3 }, (_, i) => media(i + 1));
    const native = fakeNative(new Map(listed.map((m, i) => [m.uri, tags(`h${i}`)])), listed);
    const token = { cancelled: false };
    const progress: number[] = [];

    const result = await scanLibrary(
      db,
      { ...deps(native), native },
      {
        token,
        onProgress: ({ done }) => {
          progress.push(done);
          if (done >= READ_BATCH) token.cancelled = true;
        },
      }
    );

    expect(result.cancelled).toBe(true);
    expect(result.added).toBe(READ_BATCH);
    expect(progress).toEqual([0, READ_BATCH]);
    expect(describeScan(result)).toBe(
      `${READ_BATCH * 3} songs found · ${READ_BATCH} new · stopped early`
    );
  });

  it('counts unreadable files as failed and adds nothing for them', async () => {
    const db = await freshDb();
    const native = fakeNative(new Map(), [media(1)]);
    const result = await scanLibrary(db, { ...deps(native), native });
    expect(result).toMatchObject({ added: 0, failed: 1 });
    expect(describeScan({ ...result, found: 0 })).toBe('No music found on this phone');
  });
});

describe('backfill and scan share one connection', () => {
  /** Counts open transactions; expo-sqlite's single connection cannot nest them. */
  function watchTransactions(db: SQLiteDatabase) {
    const seen = { open: 0, most: 0 };
    const original = db.withTransactionAsync.bind(db);
    db.withTransactionAsync = async task => {
      seen.open++;
      seen.most = Math.max(seen.most, seen.open);
      try {
        await original(task);
      } finally {
        seen.open--;
      }
    };
    return seen;
  }

  it('lets a scan take over a running backfill without overlapping transactions', async () => {
    const db = await freshDb();
    const old = Array.from({ length: READ_BATCH * 3 }, (_, i) => `file:///tracks/old${i}.mp3`);
    for (const [i, uri] of old.entries()) {
      await db.runAsync('INSERT INTO tracks (id, file_path, title) VALUES (?, ?, ?)', [
        `old${i}`,
        uri,
        `Old ${i}`,
      ]);
    }
    const files = new Map<string, TrackTags | null>(old.map((uri, i) => [uri, tags(`old${i}`)]));
    files.set(media(1).uri, tags('new'));
    const native = fakeNative(files, [media(1)]);
    // Every read yields to the event loop, so both jobs get to interleave.
    native.readTracksAsync.mockImplementation(async (uris: string[]) => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return uris.map(uri => files.get(uri) ?? null);
    });
    const seen = watchTransactions(db);

    const backfill = backfillHashes(db, deps(native));
    await new Promise(resolve => setTimeout(resolve, 0));
    const scan = scanLibrary(db, { ...deps(native), native });
    // A backfill asked for while the scan runs is skipped, not run alongside.
    expect(await backfillHashes(db, deps(native))).toBe(0);

    const [, result] = await Promise.all([backfill, scan]);

    expect(seen.most).toBe(1);
    expect(result).toMatchObject({ added: 1, failed: 0 });
    // Whatever the backfill left over, the scan hashed before it read the phone.
    const unhashed = await db.getAllAsync('SELECT id FROM tracks WHERE content_hash IS NULL');
    expect(unhashed).toEqual([]);
  });

  it('lets only one of several waiters take the lock when a job ends', async () => {
    let running = 0;
    let most = 0;
    let release = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const step = (wait?: Promise<void>) =>
      withLibraryLock(async () => {
        running++;
        most = Math.max(most, running);
        await (wait ?? new Promise(resolve => setTimeout(resolve, 1)));
        running--;
      });
    const first = step(gate);
    const waiters = [step(), step(), step()];
    await new Promise(resolve => setTimeout(resolve, 0));
    release();
    await Promise.all([first, ...waiters]);
    expect(most).toBe(1);
  });

  it('runs a desktop sync step only once a running scan is done', async () => {
    const db = await freshDb();
    const native = fakeNative(new Map(), []);
    const order: string[] = [];
    let release = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    native.queryAudioAsync.mockImplementation(async () => {
      order.push('scan');
      await gate;
      return [];
    });
    const scan = scanLibrary(db, { ...deps(native), native });
    await new Promise(resolve => setTimeout(resolve, 0));
    const step = withLibraryLock(async () => {
      order.push('sync');
      return 'written';
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(order).toEqual(['scan']);

    release();
    await scan;
    expect(await step).toBe('written');
    expect(order).toEqual(['scan', 'sync']);
    // And a backfill asked for while nothing runs is free to go again.
    expect(await backfillHashes(db, deps(native))).toBe(0);
  });
});
