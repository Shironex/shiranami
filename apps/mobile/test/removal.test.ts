import type { SQLiteDatabase } from 'expo-sqlite';
import { deleteOwnedFiles, deleteTracksFromDb, isAppOwnedPath } from '@/lib/removal';
import {
  attachTransport,
  usePlayerStore,
  type PlayerTransport,
  type Track,
} from '@/stores/usePlayerStore';
import { usePlaylistStore } from '@/stores/usePlaylistStore';
import { UNDO_WINDOW_MS, useRemovalStore } from '@/stores/useRemovalStore';

const TRACKS_DIR = 'file:///data/user/0/app/files/tracks/';
const mockDeleteFile = jest.fn();

jest.mock('@/lib/track-files', () => ({
  appFileDeleter: () => ({
    tracksDirUri: 'file:///data/user/0/app/files/tracks/',
    deleteFile: (uri: string) => mockDeleteFile(uri),
  }),
}));

/** Rows a fake SQLite holds; only the statements the removal uses are understood. */
function fakeDb(rows: Record<string, string[]>) {
  const tables = new Map(Object.entries(rows).map(([k, v]) => [k, [...v]]));
  const db = {
    tables,
    failNext: false,
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
      const snapshot = new Map([...tables].map(([k, v]) => [k, [...v]]));
      try {
        await task();
      } catch (error) {
        tables.clear();
        snapshot.forEach((v, k) => tables.set(k, v));
        throw error;
      }
    }),
    runAsync: jest.fn(async (sql: string, ids: string[]) => {
      if (db.failNext && sql.startsWith('DELETE FROM tracks')) throw new Error('disk full');
      const table = /DELETE FROM (\w+)/.exec(sql)![1];
      tables.set(
        table,
        (tables.get(table) ?? []).filter(id => !ids.includes(id))
      );
    }),
    getAllAsync: jest.fn(async () =>
      (tables.get('tracks') ?? []).map(id => ({
        id,
        file_path: `${TRACKS_DIR}${id}.mp3`,
        title: id,
        artist: 'Artist',
        album: 'Album',
        duration: 100,
        album_art: null,
        is_favorite: 0,
        play_count: 0,
        created_at: '2026-01-01 00:00:00',
      }))
    ),
  };
  return db;
}

function track(id: string, filePath = `${TRACKS_DIR}${id}.mp3`): Track {
  return { id, title: id, artist: 'Artist', album: 'Album', duration: 100, filePath };
}

describe('isAppOwnedPath', () => {
  it('accepts files inside the tracks folder', () => {
    expect(isAppOwnedPath(`${TRACKS_DIR}a.mp3`, TRACKS_DIR)).toBe(true);
    expect(isAppOwnedPath(`${TRACKS_DIR}a.mp3`, TRACKS_DIR.slice(0, -1))).toBe(true);
  });

  it('rejects anything outside it', () => {
    expect(isAppOwnedPath('content://media/external/audio/media/9', TRACKS_DIR)).toBe(false);
    expect(isAppOwnedPath('file:///storage/emulated/0/Music/a.mp3', TRACKS_DIR)).toBe(false);
    expect(isAppOwnedPath('file:///data/user/0/app/files/tracks-other/a.mp3', TRACKS_DIR)).toBe(
      false
    );
    expect(isAppOwnedPath(TRACKS_DIR, TRACKS_DIR)).toBe(false);
  });

  it('rejects traversal out of the folder', () => {
    expect(isAppOwnedPath(`${TRACKS_DIR}../secret.db`, TRACKS_DIR)).toBe(false);
    expect(isAppOwnedPath(`${TRACKS_DIR}%2e%2e/secret.db`, TRACKS_DIR)).toBe(false);
  });
});

describe('deleteOwnedFiles', () => {
  it('deletes owned files only and survives a failing delete', () => {
    const deleteFile = jest.fn((uri: string) => {
      if (uri.endsWith('bad.mp3')) throw new Error('locked');
    });
    const deleted = deleteOwnedFiles(
      [`${TRACKS_DIR}a.mp3`, 'content://media/9', `${TRACKS_DIR}bad.mp3`, `${TRACKS_DIR}b.mp3`],
      { tracksDirUri: TRACKS_DIR, deleteFile }
    );

    expect(deleted).toEqual([`${TRACKS_DIR}a.mp3`, `${TRACKS_DIR}b.mp3`]);
    expect(deleteFile).not.toHaveBeenCalledWith('content://media/9');
  });
});

describe('deleteTracksFromDb', () => {
  it('removes the rows and every reference to them', async () => {
    const db = fakeDb({
      tracks: ['a', 'b'],
      playlist_tracks: ['a', 'b'],
      play_history: ['a', 'a', 'b'],
      youtube_mappings: ['a'],
    });
    await deleteTracksFromDb(db as unknown as SQLiteDatabase, ['a']);

    expect(db.tables.get('tracks')).toEqual(['b']);
    expect(db.tables.get('playlist_tracks')).toEqual(['b']);
    expect(db.tables.get('play_history')).toEqual(['b']);
    expect(db.tables.get('youtube_mappings')).toEqual([]);
  });
});

describe('removing tracks with undo', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => track(id));
  const initialPlayer = usePlayerStore.getState();
  const initialPlaylists = usePlaylistStore.getState();
  const player = () => usePlayerStore.getState();
  const ids = (tracks: Track[]) => tracks.map(t => t.id);
  let transport: jest.Mocked<PlayerTransport>;
  let detach: () => void;
  let db: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    jest.useFakeTimers();
    usePlayerStore.setState(initialPlayer, true);
    usePlaylistStore.setState(initialPlaylists, true);
    useRemovalStore.setState({ pending: null });
    transport = {
      load: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(),
      stop: jest.fn(),
      setVolume: jest.fn(),
    };
    detach = attachTransport(transport);
    db = fakeDb({
      tracks: ['a', 'b', 'c', 'd'],
      playlist_tracks: ['b', 'c'],
      play_history: ['b'],
      youtube_mappings: [],
    });
    player().setLibrary([a, b, c, d]);
    usePlaylistStore.setState({
      playlists: [{ id: 'p', name: 'P', trackIds: ['b', 'c'], updatedAt: '' }],
    });
  });

  afterEach(() => {
    detach();
    jest.useRealTimers();
  });

  const remove = (...tracks: Track[]) =>
    useRemovalStore.getState().remove(db as unknown as SQLiteDatabase, tracks);

  it('hides the song at once but writes nothing until the window ends', () => {
    remove(b);

    expect(ids(player().library)).toEqual(['a', 'c', 'd']);
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(['c']);
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('commits after the timeout: rows, references and the app-owned file', async () => {
    remove(b);
    await jest.advanceTimersByTimeAsync(UNDO_WINDOW_MS);

    expect(db.tables.get('tracks')).toEqual(['a', 'c', 'd']);
    expect(db.tables.get('playlist_tracks')).toEqual(['c']);
    expect(db.tables.get('play_history')).toEqual([]);
    expect(mockDeleteFile).toHaveBeenCalledWith(`${TRACKS_DIR}b.mp3`);
    expect(useRemovalStore.getState().pending).toBeNull();
  });

  it('commits when the app backgrounds, before the timer', async () => {
    remove(b);
    await useRemovalStore.getState().commit();

    expect(db.tables.get('tracks')).toEqual(['a', 'c', 'd']);
    await jest.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('never deletes a file outside app storage', async () => {
    const outside = track('e', 'content://media/external/audio/media/9');
    player().setLibrary([a, outside]);
    remove(outside);
    await useRemovalStore.getState().commit();

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('keeps the songs and the files when the database write fails', async () => {
    db.failNext = true;
    remove(b);
    await useRemovalStore.getState().commit();

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(ids(player().library)).toEqual(['a', 'b', 'c', 'd']);
    expect(usePlaylistStore.getState().hiddenTrackIds).toEqual([]);
  });

  it('undo brings back the library, the playlist entry and the file', async () => {
    remove(b);
    await useRemovalStore.getState().undo();
    await jest.advanceTimersByTimeAsync(UNDO_WINDOW_MS);

    expect(ids(player().library).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(usePlaylistStore.getState().hiddenTrackIds).toEqual([]);
    expect(db.tables.get('tracks')).toEqual(['a', 'b', 'c', 'd']);
    expect(db.tables.get('playlist_tracks')).toEqual(['b', 'c']);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('a second removal finalises the first', async () => {
    remove(a);
    remove(c);
    await jest.advanceTimersByTimeAsync(0);

    expect(db.tables.get('tracks')).toEqual(['b', 'c', 'd']);
    expect(useRemovalStore.getState().pending?.tracks.map(t => t.id)).toEqual(['c']);
  });

  describe('the queue', () => {
    it('drops a queued song and keeps the playing one', () => {
      player().playFromList([a, b, c, d], 2);
      remove(a);

      expect(ids(player().queue)).toEqual(['b', 'c', 'd']);
      expect(player().currentTrack?.id).toBe('c');
      expect(player().queueIndex).toBe(1);
    });

    it('skips to the next song when the playing one is removed', () => {
      player().playFromList([a, b, c, d], 1);
      remove(b);

      expect(player().currentTrack?.id).toBe('c');
      expect(ids(player().queue)).toEqual(['a', 'c', 'd']);
      expect(player().queueIndex).toBe(1);
      expect(transport.load).toHaveBeenLastCalledWith(c);
    });

    it('stops when the playing song was the last one', () => {
      player().playFromList([a, b], 1);
      remove(b);

      expect(player().currentTrack).toBeNull();
      expect(player().isPlaying).toBe(false);
      expect(transport.stop).toHaveBeenCalled();
    });

    it('wraps to the start with repeat all', () => {
      player().playFromList([a, b], 1);
      player().cycleRepeatMode();
      remove(b);

      expect(player().currentTrack?.id).toBe('a');
    });

    it('undo puts a queued song back where it was', async () => {
      player().playFromList([a, b, c, d], 2);
      remove(a, d);
      await useRemovalStore.getState().undo();

      expect(ids(player().queue)).toEqual(['a', 'b', 'c', 'd']);
      expect(player().currentTrack?.id).toBe('c');
      expect(player().queueIndex).toBe(2);
    });

    it('undo of the playing song restores it to the queue without stealing playback', async () => {
      player().playFromList([a, b, c], 1);
      remove(b);
      await useRemovalStore.getState().undo();

      expect(ids(player().queue)).toEqual(['a', 'b', 'c']);
      expect(player().currentTrack?.id).toBe('c');
      expect(player().queueIndex).toBe(2);
    });
  });
});
