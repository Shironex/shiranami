import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/hooks/queries/useLibrary', () => ({
  libraryKeys: { all: ['library'] },
}));
vi.mock('@/hooks/queries/useFolders', () => ({
  folderKeys: { all: ['folders'] },
}));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

// Mock useTrackImport — we test it separately
const mockImportTrack = vi.fn();
vi.mock('@/hooks/useTrackImport', () => ({
  useTrackImport: () => ({ importTrack: mockImportTrack }),
}));

import { useLibraryActions } from '@/hooks/useLibraryActions';
import { toast } from 'sonner';
import { queryClient } from '@/lib/queryClient';

const fakeScanResult = (filePath: string) => ({
  filePath,
  metadata: {
    title: `Title for ${filePath}`,
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 200,
    genre: 'Rock',
    year: 2024,
    trackNumber: 1,
    albumArt: null,
  },
});

const fakeDbTrack = (id: string, filePath: string): Record<string, unknown> => ({
  id,
  title: `Title for ${filePath}`,
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 200,
  filePath,
  genre: 'Rock',
  year: 2024,
  trackNumber: 1,
  albumArt: null,
  isFavorite: false,
  playCount: 0,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
});

function resetStore() {
  usePlayerStore.setState({
    library: [],
    queue: [],
    queueIndex: -1,
    currentTrack: null,
    isPlaying: false,
  });
}

function resetMocks() {
  vi.mocked(window.electronAPI.dialog.openDirectory).mockReset().mockResolvedValue(null as never);
  vi.mocked(window.electronAPI.dialog.openFile).mockReset().mockResolvedValue(null as never);
  vi.mocked(window.electronAPI.library.scanFolder).mockReset().mockResolvedValue([] as never);
  vi.mocked(window.electronAPI.db.tracks.exists).mockReset().mockResolvedValue(false as never);
  vi.mocked(window.electronAPI.db.tracks.addMany).mockReset().mockResolvedValue([] as never);
  vi.mocked(window.electronAPI.db.folders.add).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(queryClient.invalidateQueries).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.info).mockClear();
  vi.mocked(toast.error).mockClear();
  mockImportTrack.mockReset();
}

describe('useLibraryActions', () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  describe('handleOpenFile', () => {
    it('does nothing when dialog is cancelled', async () => {
      vi.mocked(window.electronAPI.dialog.openFile).mockResolvedValue(null as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFile();
      });

      expect(mockImportTrack).not.toHaveBeenCalled();
    });

    it('imports a track and shows success toast', async () => {
      vi.mocked(window.electronAPI.dialog.openFile).mockResolvedValue('/music/song.mp3' as never);
      const fakeTrack: Track = {
        id: 'track-1',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 200,
        filePath: '/music/song.mp3',
      };
      mockImportTrack.mockResolvedValue(fakeTrack);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFile();
      });

      expect(mockImportTrack).toHaveBeenCalledWith('/music/song.mp3');
      expect(toast.success).toHaveBeenCalledWith('added1Track');
    });

    it('shows info toast when track already exists', async () => {
      vi.mocked(window.electronAPI.dialog.openFile).mockResolvedValue('/music/song.mp3' as never);
      mockImportTrack.mockResolvedValue(null);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFile();
      });

      expect(toast.info).toHaveBeenCalledWith('trackAlreadyInLibrary');
    });

    it('shows error toast when import fails', async () => {
      vi.mocked(window.electronAPI.dialog.openFile).mockResolvedValue('/music/song.mp3' as never);
      mockImportTrack.mockRejectedValue(new Error('parse failed'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFile();
      });

      expect(toast.error).toHaveBeenCalledWith('failedAddTrack');
    });
  });

  describe('handleOpenFolder', () => {
    it('does nothing when dialog is cancelled', async () => {
      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue(null as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(window.electronAPI.library.scanFolder).not.toHaveBeenCalled();
    });

    it('shows info toast when folder contains no audio files', async () => {
      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music/empty' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue([] as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(toast.info).toHaveBeenCalledWith('noAudioInFolder');
    });

    it('shows info toast when all scanned tracks already exist', async () => {
      const scanResults = [fakeScanResult('/music/song1.mp3')];
      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      // Track exists in DB
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(true as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(toast.info).toHaveBeenCalledWith('allTracksExist');
      expect(window.electronAPI.db.tracks.addMany).not.toHaveBeenCalled();
    });

    it('shows info toast when all scanned tracks already exist in library store', async () => {
      const existingTrack: Track = {
        id: 'existing-1',
        title: 'Song 1',
        artist: 'Artist',
        album: 'Album',
        duration: 200,
        filePath: '/music/song1.mp3',
      };
      usePlayerStore.setState({ library: [existingTrack] });

      const scanResults = [fakeScanResult('/music/song1.mp3')];
      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      // Filtered out by library check, so DB exists check not even called for this track
      expect(toast.info).toHaveBeenCalledWith('allTracksExist');
    });

    it('saves new tracks to DB, adds to library and queue', async () => {
      const scanResults = [
        fakeScanResult('/music/song1.mp3'),
        fakeScanResult('/music/song2.mp3'),
      ];
      const dbTracks = [
        fakeDbTrack('t1', '/music/song1.mp3'),
        fakeDbTrack('t2', '/music/song2.mp3'),
      ];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(window.electronAPI.db.tracks.addMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ filePath: '/music/song1.mp3' }),
          expect.objectContaining({ filePath: '/music/song2.mp3' }),
        ])
      );

      const state = usePlayerStore.getState();
      expect(state.library).toHaveLength(2);
      expect(state.queue).toHaveLength(2);
    });

    it('saves the folder path to DB', async () => {
      const scanResults = [fakeScanResult('/music/song1.mp3')];
      const dbTracks = [fakeDbTrack('t1', '/music/song1.mp3')];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(window.electronAPI.db.folders.add).toHaveBeenCalledWith('/music');
    });

    it('sets queue with index 0 when nothing is currently playing', async () => {
      const scanResults = [fakeScanResult('/music/song1.mp3')];
      const dbTracks = [fakeDbTrack('t1', '/music/song1.mp3')];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      const state = usePlayerStore.getState();
      expect(state.queue).toHaveLength(1);
      expect(state.currentTrack).not.toBeNull();
    });

    it('appends to queue without changing current track when something is playing', async () => {
      const existingTrack: Track = {
        id: 'existing-1',
        title: 'Existing',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        filePath: '/music/existing.mp3',
      };
      usePlayerStore.setState({
        queue: [existingTrack],
        queueIndex: 0,
        currentTrack: existingTrack,
        isPlaying: true,
      });

      const scanResults = [fakeScanResult('/music/song1.mp3')];
      const dbTracks = [fakeDbTrack('t1', '/music/song1.mp3')];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      const state = usePlayerStore.getState();
      expect(state.queue).toHaveLength(2);
      expect(state.currentTrack?.id).toBe('existing-1');
    });

    it('invalidates library and folder query caches after successful scan', async () => {
      const scanResults = [fakeScanResult('/music/song1.mp3')];
      const dbTracks = [fakeDbTrack('t1', '/music/song1.mp3')];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['library'],
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['folders'],
      });
    });

    it('shows success toast with track count after adding', async () => {
      const scanResults = [
        fakeScanResult('/music/song1.mp3'),
        fakeScanResult('/music/song2.mp3'),
      ];
      const dbTracks = [
        fakeDbTrack('t1', '/music/song1.mp3'),
        fakeDbTrack('t2', '/music/song2.mp3'),
      ];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(toast.success).toHaveBeenCalledWith('addedTracks');
    });

    it('shows error toast when scan fails', async () => {
      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockRejectedValue(
        new Error('scan error')
      );

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(toast.error).toHaveBeenCalledWith('failedScanFolder');
    });

    it('sets isScanning to true during scan and false after completion', async () => {
      let resolveScan!: (value: unknown[]) => void;
      const scanPromise = new Promise<unknown[]>(resolve => {
        resolveScan = resolve;
      });

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockReturnValue(scanPromise as never);

      const { result } = renderHook(() => useLibraryActions());

      expect(result.current.isScanning).toBe(false);

      // Start the scan but don't resolve yet
      let scanDone: Promise<void>;
      act(() => {
        scanDone = result.current.handleOpenFolder();
      });

      // Wait for microtasks so the state update from setIsScanning(true) has taken effect
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isScanning).toBe(true);

      // Resolve with empty results to finish scan
      await act(async () => {
        resolveScan([]);
        await scanDone!;
      });

      expect(result.current.isScanning).toBe(false);
    });

    it('resets isScanning to false even when scan throws', async () => {
      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockRejectedValue(
        new Error('scan error')
      );

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      expect(result.current.isScanning).toBe(false);
    });

    it('filters out tracks already in library store before checking DB', async () => {
      const existingTrack: Track = {
        id: 'existing-1',
        title: 'Song 1',
        artist: 'Artist',
        album: 'Album',
        duration: 200,
        filePath: '/music/song1.mp3',
      };
      usePlayerStore.setState({ library: [existingTrack] });

      const scanResults = [
        fakeScanResult('/music/song1.mp3'), // already in library
        fakeScanResult('/music/song2.mp3'), // new
      ];
      const dbTracks = [fakeDbTrack('t2', '/music/song2.mp3')];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      // Only song2 should be checked against DB (song1 filtered by library store)
      expect(window.electronAPI.db.tracks.exists).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.db.tracks.exists).toHaveBeenCalledWith('/music/song2.mp3');

      // Only song2 should be added
      expect(window.electronAPI.db.tracks.addMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ filePath: '/music/song2.mp3' }),
        ])
      );

      const state = usePlayerStore.getState();
      // Library should now have existing + new
      expect(state.library).toHaveLength(2);
    });

    it('does not fail if folder add throws (folder may already exist)', async () => {
      const scanResults = [fakeScanResult('/music/song1.mp3')];
      const dbTracks = [fakeDbTrack('t1', '/music/song1.mp3')];

      vi.mocked(window.electronAPI.dialog.openDirectory).mockResolvedValue('/music' as never);
      vi.mocked(window.electronAPI.library.scanFolder).mockResolvedValue(scanResults as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.db.tracks.addMany).mockResolvedValue(dbTracks as never);
      vi.mocked(window.electronAPI.db.folders.add).mockRejectedValue(
        new Error('UNIQUE constraint')
      );

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleOpenFolder();
      });

      // Should still succeed despite folder add error
      expect(toast.success).toHaveBeenCalledWith('addedTracks');
      expect(usePlayerStore.getState().library).toHaveLength(1);
    });
  });
});
