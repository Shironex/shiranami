import type { ManifestTrack, SyncHello } from '@shiranami/contracts/sync';
import { migrateDbIfNeeded } from '@/lib/db';
import { loadLibrary } from '@/lib/library';
import { withLibraryLock } from '@/lib/library-scan';
import { loadPlaylists } from '@/lib/playlists';
import type { SyncFetch, SyncResponse } from '@/lib/sync-client';
import type { PartialFile } from '@/lib/sync-download';
import type { DesktopPeer } from '@/lib/sync-peer';
import { runSync, type SyncDeps, type SyncProgress } from '@/lib/sync-run';
import { openTestDb } from './support/sqlite';

const DEVICE_SECRET = 'R_T6TkxtTqk6KHHqxANdfbYs5MLiuZIJZvjiCB_Y8ew';

const PEER: DesktopPeer = {
  desktopId: 'desk-1',
  desktopName: 'Studio PC',
  libraryId: 'lib-1',
  hosts: ['10.0.0.5', '192.168.1.20'],
  port: 53111,
  deviceId: 'dev-0001',
  skew: 0,
  pairedAt: '2026-11-08T10:00:00.000Z',
  lastSyncAt: null,
};

function track(id: string, extra: Partial<ManifestTrack> = {}): ManifestTrack {
  return {
    id,
    title: `Song ${id}`,
    artist: 'Desk',
    albumArtist: null,
    album: 'Album',
    genre: null,
    year: null,
    trackNumber: null,
    discNumber: null,
    duration: 100,
    contentHash: `a1:${id}`,
    artworkHash: `art-${id}`,
    sizeBytes: 3,
    fileVersion: `3-${id}`,
    format: 'flac',
    isFavorite: false,
    playCount: 0,
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

function json(body: unknown, status = 200): SyncResponse {
  return {
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function audio(): SyncResponse {
  let sent = false;
  return {
    ...json(null),
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: Uint8Array.from([1, 2, 3]) };
        },
        cancel: async () => undefined,
      }),
    } as unknown as ReadableStream<Uint8Array>,
  };
}

const HELLO: SyncHello = {
  protocolVersion: 2,
  minProtocolVersion: 2,
  desktopId: 'desk-1',
  desktopName: 'Studio PC',
  libraryId: 'lib-1',
  appVersion: '2.1.0',
  serverTime: 1762600050,
  deviceId: 'dev-0001',
  capabilities: ['manifest', 'playlists', 'favorites', 'history', 'artwork', 'audio-range'],
  trackCount: 3,
};

/** A desktop on 192.168.1.20 with three songs, one of which the phone already has. */
function fakeDesktop() {
  const paths: string[] = [];
  const fetchImpl: SyncFetch = async (url, init) => {
    if (!url.startsWith('http://192.168.1.20:53111')) throw new TypeError('unreachable');
    const path = url.slice('http://192.168.1.20:53111'.length);
    if (!init.headers.Authorization) return json(null, 404);
    expect(init.headers.Authorization).toMatch(/^SNM1 dev=dev-0001,ts=\d+,n=[\w-]{22},sig=/);
    paths.push(path.split('?')[0]);
    if (path === '/v1/sync/hello') return json(HELLO);
    if (path.startsWith('/v1/sync/manifest')) {
      const second = path.includes('cursor=page2');
      return json({
        libraryId: 'lib-1',
        trackCount: 3,
        tracks: second ? [track('d3', { contentHash: 'a1:mine' })] : [track('d1'), track('d2')],
        nextCursor: second ? null : 'page2',
        hasMore: !second,
      });
    }
    if (path === '/v1/sync/favorites') return json({ trackIds: ['d2', 'd3'] });
    if (path === '/v1/sync/playlists') {
      return json({
        playlists: [
          {
            id: 'pl-1',
            name: 'Night',
            description: null,
            artworkHash: null,
            createdAt: '',
            updatedAt: '',
            trackIds: ['d3', 'd1'],
          },
        ],
      });
    }
    if (path.startsWith('/v1/sync/history')) {
      return json({ entries: [], nextCursor: null, hasMore: false });
    }
    if (path.endsWith('/audio')) return audio();
    return json(null, 404);
  };
  return { fetchImpl, paths };
}

function memoryFiles() {
  const written = new Map<string, number[]>();
  const partialFile = (name: string): PartialFile => {
    let data: number[] = [];
    return {
      size: () => data.length,
      append: bytes => {
        data = [...data, ...bytes];
      },
      reset: () => {
        data = [];
      },
      close: () => undefined,
      finish: async () => {
        written.set(name, data);
        return `file:///tracks/${name}`;
      },
    };
  };
  return { written, partialFile };
}

async function setup() {
  const db = openTestDb();
  await migrateDbIfNeeded(db);
  await db.runAsync(
    "INSERT INTO tracks (id, file_path, title, content_hash, source) VALUES ('p1', 'content://media/9', 'Mine', 'a1:mine', 'device')"
  );
  const files = memoryFiles();
  const saved: DesktopPeer[] = [];
  const desktop = fakeDesktop();
  const deps: SyncDeps = {
    fetch: desktop.fetchImpl,
    lock: withLibraryLock,
    partialFile: files.partialFile,
    audioFileName: id => `${id}.flac`,
    saveArt: async (_client, hash) => `file:///art/${hash}.jpg`,
    savePeer: async peer => void saved.push(peer),
    now: () => 1762600000_000,
  };
  return { db, deps, files, saved, desktop };
}

describe('runSync', () => {
  it('pulls favorites and playlists before the songs, links what the phone has, then covers', async () => {
    const { db, deps, files, saved, desktop } = await setup();
    const stages: SyncProgress['stage'][] = [];
    const summary = await runSync(db, PEER, DEVICE_SECRET, deps, {
      onProgress: progress => {
        if (stages[stages.length - 1] !== progress.stage) stages.push(progress.stage);
      },
    });

    expect(stages).toEqual(['connecting', 'favorites', 'playlists', 'library', 'covers', 'done']);
    expect(summary).toEqual({
      downloaded: 2,
      linked: 1,
      failed: 0,
      favorites: 2,
      playlists: 1,
      history: 0,
    });
    // Favorites and playlists were requested before any audio.
    const firstAudio = desktop.paths.findIndex(path => path.endsWith('/audio'));
    expect(desktop.paths.indexOf('/v1/sync/playlists')).toBeLessThan(firstAudio);
    expect([...files.written.keys()]).toEqual(['d1.flac', 'd2.flac']);

    const library = await loadLibrary(db);
    expect(library.map(t => t.id).sort()).toEqual(['d1', 'd2', 'p1']);
    expect(library.find(t => t.id === 'p1')).toMatchObject({
      filePath: 'content://media/9',
      isFavorite: true,
      albumArt: 'file:///art/art-d3.jpg',
    });
    const [playlist] = await loadPlaylists(db);
    expect(playlist).toMatchObject({ id: 'pl-1', trackIds: ['p1', 'd1'] });

    expect(saved).toEqual([
      {
        ...PEER,
        hosts: ['192.168.1.20', '10.0.0.5'],
        skew: 50,
        lastSyncAt: '2025-11-08T11:06:40.000Z',
      },
    ]);
  });

  it('downloads nothing the second time', async () => {
    const { db, deps, files } = await setup();
    await runSync(db, PEER, DEVICE_SECRET, deps);
    files.written.clear();
    const again = await runSync(db, PEER, DEVICE_SECRET, deps);
    expect(again.downloaded).toBe(0);
    expect(files.written.size).toBe(0);
  });

  it('stops on cancel and keeps what landed', async () => {
    const { db, deps } = await setup();
    const controller = new AbortController();
    const run = runSync(db, PEER, DEVICE_SECRET, deps, {
      signal: controller.signal,
      onSong: () => controller.abort(),
    });
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    expect((await loadLibrary(db)).map(t => t.id).sort()).toEqual(['d1', 'p1']);
  });

  it('reports an unreachable desktop', async () => {
    const { db, deps } = await setup();
    await expect(
      runSync(db, { ...PEER, hosts: ['10.0.0.5'] }, DEVICE_SECRET, deps)
    ).rejects.toMatchObject({ code: 'unreachable' });
  });
});
