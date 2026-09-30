import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/i18n', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) return key;
      const { ns: _ns, ...params } = options;
      return `${key}(${JSON.stringify(params)})`;
    },
  },
}));
vi.mock('@/hooks/queries/usePlaylists', () => ({
  playlistKeys: { all: ['playlists'] },
  usePlaylistsQuery: () => ({ data: [] }),
}));

import { useLibraryRescan } from '@/hooks/useLibraryRescan';
import { toast } from 'sonner';

const metadata = (title: string) => ({
  title,
  artist: 'Artist',
  albumArtist: null,
  album: 'Album',
  duration: 200,
  genre: 'Lofi',
  year: 2024,
  trackNumber: 1,
  discNumber: 1,
  albumArt: null,
});

const libraryTrack = (id: string, filePath: string, playCount = 0): Track => ({
  id,
  title: id,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  filePath,
  isFavorite: false,
  playCount,
});

const dbRow = (id: string, filePath: string, playCount = 0): Record<string, unknown> => ({
  id,
  title: id,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  filePath,
  genre: 'Lofi',
  year: 2024,
  trackNumber: 1,
  albumArt: null,
  isFavorite: false,
  playCount,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
});

/** Make `validateFiles` report exactly these paths as gone from disk. */
function goneFromDisk(...gone: string[]) {
  vi.mocked(window.electronAPI.library.validateFiles).mockImplementation((async (paths: string[]) =>
    paths.filter(path => gone.includes(path))) as never);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

async function rescan() {
  const { result } = renderHook(() => useLibraryRescan(), { wrapper });
  await act(async () => {
    await result.current.rescan();
  });
}

describe('useLibraryRescan', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], scanState: 'idle' });
    usePlaybackStore.setState({ queue: [], queueIndex: -1, currentTrack: null });
    vi.mocked(window.electronAPI.db.folders.getAll).mockResolvedValue([
      { id: 'folder-1', path: '/music' },
    ] as never);
    vi.mocked(window.electronAPI.db.tracks.existsMany)
      .mockReset()
      .mockResolvedValue([] as never);
    // By default the backend deletes every row it is asked to.
    vi.mocked(window.electronAPI.db.tracks.removeMany)
      .mockReset()
      .mockImplementation((async (ids: string[]) => ids) as never);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  it('keeps a moved track: same id, new path, play count intact, never deleted', async () => {
    useLibraryStore.setState({ library: [libraryTrack('t1', '/music/old/song.mp3', 7)] });
    vi.mocked(window.electronAPI.library.scanFolderGrouped).mockResolvedValue({
      rootTracks: [{ filePath: '/music/new/song.mp3', metadata: metadata('Song') }],
      subfolders: [],
    } as never);
    // The import re-pointed the existing row: it comes back with its old id.
    vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue([
      dbRow('t1', '/music/new/song.mp3', 7),
    ] as never);
    goneFromDisk('/music/old/song.mp3');

    await rescan();

    expect(window.electronAPI.db.tracks.removeMany).not.toHaveBeenCalled();
    expect(window.electronAPI.db.tracks.addMany).toHaveBeenCalledWith(expect.any(Array), {
      followMoves: true,
    });
    const library = useLibraryStore.getState().library;
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({ id: 't1', filePath: '/music/new/song.mp3', playCount: 7 });
    expect(toast.success).toHaveBeenCalledWith(
      'rescanSummaryWithMoves({"parts":"rescanPartMoved({\\"count\\":1})"})'
    );
  });

  it('still removes a genuinely deleted track in the same rescan as a move', async () => {
    useLibraryStore.setState({
      library: [
        libraryTrack('moved', '/music/a/song.mp3', 3),
        libraryTrack('deleted', '/music/a/gone.mp3'),
        libraryTrack('kept', '/music/a/kept.mp3'),
      ],
    });
    vi.mocked(window.electronAPI.library.scanFolderGrouped).mockResolvedValue({
      rootTracks: [
        { filePath: '/music/b/song.mp3', metadata: metadata('Song') },
        { filePath: '/music/a/kept.mp3', metadata: metadata('Kept') },
        { filePath: '/music/b/fresh.mp3', metadata: metadata('Fresh') },
      ],
      subfolders: [],
    } as never);
    vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue([
      dbRow('fresh', '/music/b/fresh.mp3'),
      dbRow('moved', '/music/b/song.mp3', 3),
    ] as never);
    goneFromDisk('/music/a/song.mp3', '/music/a/gone.mp3');

    await rescan();

    expect(window.electronAPI.db.tracks.removeMany).toHaveBeenCalledWith(
      ['deleted'],
      ['/music/a/gone.mp3']
    );
    const ids = useLibraryStore.getState().library.map(t => t.id);
    expect(ids).toEqual(['moved', 'kept', 'fresh']);
    expect(toast.success).toHaveBeenCalledWith(
      'rescanSummaryWithMoves({"parts":"rescanPartMoved({\\"count\\":1}), ' +
        'rescanPartNew({\\"count\\":1}), rescanPartRemoved({\\"count\\":1})"})'
    );
  });

  it('keeps the original wording when nothing moved', async () => {
    useLibraryStore.setState({ library: [libraryTrack('gone', '/music/gone.mp3')] });
    vi.mocked(window.electronAPI.library.scanFolderGrouped).mockResolvedValue({
      rootTracks: [{ filePath: '/music/new.mp3', metadata: metadata('New') }],
      subfolders: [],
    } as never);
    vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue([
      dbRow('new', '/music/new.mp3'),
    ] as never);
    goneFromDisk('/music/gone.mp3');

    await rescan();

    expect(window.electronAPI.db.tracks.removeMany).toHaveBeenCalledWith(
      ['gone'],
      ['/music/gone.mp3']
    );
    expect(toast.success).toHaveBeenCalledWith('rescanSummary({"added":1,"removed":1})');
  });

  it('does not drop a track re-pointed while its files were being checked', async () => {
    useLibraryStore.setState({ library: [libraryTrack('t1', '/music/old/song.mp3', 7)] });
    vi.mocked(window.electronAPI.library.scanFolderGrouped).mockResolvedValue({
      rootTracks: [],
      subfolders: [],
    } as never);
    // While validateFiles runs, another writer (a download import, which does
    // not take the scan lock) re-points t1 and updates the store.
    vi.mocked(window.electronAPI.library.validateFiles).mockImplementation((async (
      paths: string[]
    ) => {
      useLibraryStore.getState().addToLibrary([libraryTrack('t1', '/music/new/song.mp3', 7)]);
      return paths.filter(path => path === '/music/old/song.mp3');
    }) as never);
    // The backend refuses the row: it now holds a different path than the one checked.
    vi.mocked(window.electronAPI.db.tracks.removeMany).mockResolvedValue([] as never);

    await rescan();

    // The delete names the path it checked, so the backend keeps the row,
    expect(window.electronAPI.db.tracks.removeMany).toHaveBeenCalledWith(
      ['t1'],
      ['/music/old/song.mp3']
    );
    // and the store drops only what the backend reports deleted.
    expect(useLibraryStore.getState().library).toEqual([
      expect.objectContaining({ id: 't1', filePath: '/music/new/song.mp3' }),
    ]);
  });
});
