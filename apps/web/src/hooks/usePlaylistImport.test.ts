import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { SearchResult } from '@/types/electron.d';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/hooks/queries/useLibrary', () => ({
  libraryKeys: { all: ['library'] },
}));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { usePlaylistImport } from '@/hooks/usePlaylistImport';
import { usePlaylistImportStore } from '@/stores/usePlaylistImportStore';
import { toast } from 'sonner';

function makeSearchResult(id: string, overrides?: Partial<SearchResult>): SearchResult {
  return {
    id,
    title: `Title ${id}`,
    uploader: `Uploader ${id}`,
    duration: 180,
    thumbnail: `https://img.example.com/${id}.jpg`,
    url: `https://example.com/${id}`,
    webpage_url: `https://example.com/watch/${id}`,
    ...overrides,
  };
}

function resetStore() {
  usePlaylistImportStore.getState().reset();
}

describe('usePlaylistImport', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(window.electronAPI.playlist.extract).mockReset();
    vi.mocked(window.electronAPI.playlist.cancel).mockReset();
    vi.mocked(window.electronAPI.downloader.download).mockReset();
    vi.mocked(window.electronAPI.downloader.onProgress).mockReset();
    vi.mocked(window.electronAPI.playlist.onExtractProgress).mockReset();
    vi.mocked(window.electronAPI.db.tracks.exists).mockReset();
    vi.mocked(window.electronAPI.library.parseMetadata).mockReset();
    vi.mocked(window.electronAPI.db.tracks.add).mockReset();

    // Default mock returns for event listeners
    vi.mocked(window.electronAPI.downloader.onProgress).mockReturnValue(vi.fn());
    vi.mocked(window.electronAPI.playlist.onExtractProgress).mockReturnValue(vi.fn());

    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  // --- Initial state ---
  describe('initial state', () => {
    it('returns correct initial values', () => {
      const { result } = renderHook(() => usePlaylistImport());

      expect(result.current.url).toBe('');
      expect(result.current.tracks).toEqual([]);
      expect(result.current.isExtracting).toBe(false);
      expect(result.current.extractProgress).toBeNull();
      expect(result.current.isImporting).toBe(false);
      expect(result.current.extractError).toBeNull();
      expect(result.current.hasResults).toBe(false);
      expect(result.current.isFinished).toBe(false);
      expect(result.current.processedCount).toBe(0);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.overallProgress).toBe(0);
      expect(result.current.pendingCount).toBe(0);
    });
  });

  // --- handleExtract ---
  describe('handleExtract', () => {
    it('does not extract when URL is empty', async () => {
      const { result } = renderHook(() => usePlaylistImport());

      await act(async () => {
        await result.current.handleExtract();
      });

      expect(window.electronAPI.playlist.extract).not.toHaveBeenCalled();
    });

    it('does not extract when URL is whitespace only', async () => {
      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('   ');
      });

      await act(async () => {
        await result.current.handleExtract();
      });

      expect(window.electronAPI.playlist.extract).not.toHaveBeenCalled();
    });

    it('calls playlist.extract with trimmed URL and populates tracks', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('  https://youtube.com/playlist?list=PL123  ');
      });

      await act(async () => {
        await result.current.handleExtract();
      });

      expect(window.electronAPI.playlist.extract).toHaveBeenCalledWith(
        'https://youtube.com/playlist?list=PL123'
      );
      expect(result.current.tracks).toHaveLength(2);
      expect(result.current.hasResults).toBe(true);
      expect(result.current.isExtracting).toBe(false);
    });

    it('sets extractError when no tracks are found', async () => {
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue([] as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://example.com/empty-playlist');
      });

      await act(async () => {
        await result.current.handleExtract();
      });

      expect(result.current.extractError).toBe('noTracksFound');
      expect(result.current.tracks).toEqual([]);
      expect(result.current.isExtracting).toBe(false);
    });

    it('sets extractError on extraction failure', async () => {
      vi.mocked(window.electronAPI.playlist.extract).mockRejectedValue(
        new Error('Invalid playlist URL')
      );

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://bad-url.com');
      });

      await act(async () => {
        await result.current.handleExtract();
      });

      expect(result.current.extractError).toBe('Invalid playlist URL');
      expect(result.current.isExtracting).toBe(false);
    });

    it('sets extractError to i18n fallback when error is not an Error instance', async () => {
      vi.mocked(window.electronAPI.playlist.extract).mockRejectedValue('string error');

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://bad-url.com');
      });

      await act(async () => {
        await result.current.handleExtract();
      });

      expect(result.current.extractError).toBe('noTracksFound');
    });

    it('sets isExtracting true during extraction', async () => {
      let resolveExtract!: (value: SearchResult[]) => void;
      vi.mocked(window.electronAPI.playlist.extract).mockImplementation(
        () => new Promise((resolve) => { resolveExtract = resolve; })
      );

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });

      let extractPromise: Promise<void>;
      act(() => {
        extractPromise = result.current.handleExtract();
      });

      expect(result.current.isExtracting).toBe(true);

      await act(async () => {
        resolveExtract([makeSearchResult('v1')]);
        await extractPromise!;
      });

      expect(result.current.isExtracting).toBe(false);
    });

    it('clears previous extractError on new extraction', async () => {
      vi.mocked(window.electronAPI.playlist.extract)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce([makeSearchResult('v1')] as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://example.com');
      });

      await act(async () => {
        await result.current.handleExtract();
      });
      expect(result.current.extractError).toBe('fail');

      await act(async () => {
        await result.current.handleExtract();
      });
      expect(result.current.extractError).toBeNull();
    });
  });

  // --- handleKeyDown ---
  describe('handleKeyDown', () => {
    it('triggers extraction on Enter key', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });

      await act(async () => {
        result.current.handleKeyDown({ key: 'Enter' } as React.KeyboardEvent);
      });

      expect(window.electronAPI.playlist.extract).toHaveBeenCalled();
    });

    it('does not trigger extraction on other keys', async () => {
      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });

      await act(async () => {
        result.current.handleKeyDown({ key: 'Escape' } as React.KeyboardEvent);
      });

      expect(window.electronAPI.playlist.extract).not.toHaveBeenCalled();
    });
  });

  // --- handleStartImport ---
  describe('handleStartImport', () => {
    const fakeMetadata = {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      genre: 'Rock',
      year: 2024,
      trackNumber: 1,
      albumArt: null,
    };

    const fakeDbTrack = {
      id: 'track-1',
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      filePath: '/music/song.mp3',
      genre: 'Rock',
      year: 2024,
      trackNumber: 1,
      albumArt: null,
      isFavorite: false,
      playCount: 0,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    function setupImportMocks() {
      vi.mocked(window.electronAPI.downloader.download).mockResolvedValue('/music/song.mp3' as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.library.parseMetadata).mockResolvedValue({
        metadata: fakeMetadata,
      } as never);
      vi.mocked(window.electronAPI.db.tracks.add).mockResolvedValue(fakeDbTrack as never);
    }

    it('imports all pending tracks successfully', async () => {
      setupImportMocks();
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      expect(window.electronAPI.downloader.download).toHaveBeenCalledTimes(2);
      expect(result.current.isImporting).toBe(false);

      const doneTracks = result.current.tracks.filter(t => t.status === 'done');
      expect(doneTracks).toHaveLength(2);
    });

    it('shows success toast with summary after import', async () => {
      setupImportMocks();
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      expect(toast.success).toHaveBeenCalledWith('importSummary');
    });

    it('skips tracks that already exist in the database', async () => {
      setupImportMocks();
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(true as never);

      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      const skippedTracks = result.current.tracks.filter(t => t.status === 'skipped');
      expect(skippedTracks).toHaveLength(1);
    });

    it('skips duplicate URLs within the same import batch', async () => {
      setupImportMocks();
      // Two tracks with the same URL
      const duplicateUrl = 'https://example.com/watch/same-video';
      const fakeResults = [
        makeSearchResult('v1', { webpage_url: duplicateUrl }),
        makeSearchResult('v2', { webpage_url: duplicateUrl }),
      ];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      // First should be done, second should be skipped (duplicate URL)
      expect(window.electronAPI.downloader.download).toHaveBeenCalledTimes(1);
      const trackStatuses = result.current.tracks.map(t => t.status);
      expect(trackStatuses).toContain('done');
      expect(trackStatuses).toContain('skipped');
    });

    it('sets error status on track when download fails', async () => {
      vi.mocked(window.electronAPI.downloader.download).mockRejectedValue(
        new Error('Download failed')
      );
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);

      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      const errorTracks = result.current.tracks.filter(t => t.status === 'error');
      expect(errorTracks).toHaveLength(1);
      expect(errorTracks[0].error).toBe('Download failed');
    });

    it('uses i18n fallback for non-Error exceptions during import', async () => {
      vi.mocked(window.electronAPI.downloader.download).mockRejectedValue('string error');
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);

      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      const errorTracks = result.current.tracks.filter(t => t.status === 'error');
      expect(errorTracks[0].error).toBe('unknownError');
    });

    it('continues importing remaining tracks when one fails', async () => {
      vi.mocked(window.electronAPI.downloader.download)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('/music/song2.mp3' as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.library.parseMetadata).mockResolvedValue({
        metadata: fakeMetadata,
      } as never);
      vi.mocked(window.electronAPI.db.tracks.add).mockResolvedValue(fakeDbTrack as never);

      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      const statuses = result.current.tracks.map(t => t.status);
      expect(statuses[0]).toBe('error');
      expect(statuses[1]).toBe('done');
    });
  });

  // --- handleStartImportSelected ---
  describe('handleStartImportSelected', () => {
    const fakeMetadata = {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      genre: 'Rock',
      year: 2024,
      trackNumber: 1,
      albumArt: null,
    };

    const fakeDbTrack = {
      id: 'track-1',
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      filePath: '/music/song.mp3',
      genre: 'Rock',
      year: 2024,
      trackNumber: 1,
      albumArt: null,
      isFavorite: false,
      playCount: 0,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    function setupImportMocks() {
      vi.mocked(window.electronAPI.downloader.download).mockResolvedValue('/music/song.mp3' as never);
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.library.parseMetadata).mockResolvedValue({
        metadata: fakeMetadata,
      } as never);
      vi.mocked(window.electronAPI.db.tracks.add).mockResolvedValue(fakeDbTrack as never);
    }

    it('only imports selected tracks', async () => {
      setupImportMocks();
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      // Select only the first and third tracks
      const selectedIds = new Set([
        result.current.tracks[0].id,
        result.current.tracks[2].id,
      ]);

      await act(async () => {
        await result.current.handleStartImportSelected(selectedIds);
      });

      expect(window.electronAPI.downloader.download).toHaveBeenCalledTimes(2);

      const statuses = result.current.tracks.map(t => t.status);
      expect(statuses[0]).toBe('done');
      expect(statuses[1]).toBe('pending'); // Not selected, stays pending
      expect(statuses[2]).toBe('done');
    });

    it('does nothing when selectedIds is empty', async () => {
      setupImportMocks();
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImportSelected(new Set());
      });

      expect(window.electronAPI.downloader.download).not.toHaveBeenCalled();
    });
  });

  // --- handleCancel ---
  describe('handleCancel', () => {
    it('cancels the import and calls playlist.cancel', () => {
      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.handleCancel();
      });

      expect(window.electronAPI.playlist.cancel).toHaveBeenCalled();
      const storeState = usePlaylistImportStore.getState();
      expect(storeState.isCancelled).toBe(true);
      expect(storeState.isImporting).toBe(false);
    });

    it('stops the import loop when cancelled mid-import', async () => {
      let downloadCallCount = 0;
      vi.mocked(window.electronAPI.downloader.download).mockImplementation(async () => {
        downloadCallCount++;
        // Cancel after first download starts
        if (downloadCallCount === 1) {
          usePlaylistImportStore.getState().cancelImport();
        }
        return '/music/song.mp3';
      });
      vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
      vi.mocked(window.electronAPI.library.parseMetadata).mockResolvedValue({
        metadata: { title: 'Test', artist: 'Artist', album: 'Album', duration: 100, genre: null, year: null, trackNumber: null, albumArt: null },
      } as never);
      vi.mocked(window.electronAPI.db.tracks.add).mockResolvedValue({
        id: 'track-1', title: 'Test', artist: 'Artist', album: 'Album', duration: 100,
        filePath: '/music/song.mp3', isFavorite: false, playCount: 0,
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      } as never);

      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        await result.current.handleStartImport();
      });

      // Should have only downloaded 1 track before cancellation stopped the loop
      expect(downloadCallCount).toBe(1);
      expect(toast.info).toHaveBeenCalledWith('importCancelled');
    });
  });

  // --- handleReset ---
  describe('handleReset', () => {
    it('resets all state to initial values', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      expect(result.current.tracks).toHaveLength(1);

      act(() => {
        result.current.handleReset();
      });

      expect(result.current.url).toBe('');
      expect(result.current.tracks).toEqual([]);
      expect(result.current.isExtracting).toBe(false);
      expect(result.current.isImporting).toBe(false);
      expect(result.current.extractError).toBeNull();
      expect(result.current.hasResults).toBe(false);
    });
  });

  // --- handleRemoveTrack / handleRemoveTracks ---
  describe('track removal', () => {
    it('handleRemoveTrack removes a single track', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      const trackIdToRemove = result.current.tracks[0].id;

      act(() => {
        result.current.handleRemoveTrack(trackIdToRemove);
      });

      expect(result.current.tracks).toHaveLength(1);
      expect(result.current.tracks[0].searchResult.id).toBe('v2');
    });

    it('handleRemoveTracks removes multiple tracks', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      const idsToRemove = new Set([
        result.current.tracks[0].id,
        result.current.tracks[2].id,
      ]);

      act(() => {
        result.current.handleRemoveTracks(idsToRemove);
      });

      expect(result.current.tracks).toHaveLength(1);
      expect(result.current.tracks[0].searchResult.id).toBe('v2');
    });
  });

  // --- Computed values ---
  describe('computed values', () => {
    it('calculates processedCount, totalCount, overallProgress correctly', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      expect(result.current.totalCount).toBe(3);
      expect(result.current.processedCount).toBe(0);
      expect(result.current.overallProgress).toBe(0);
      expect(result.current.pendingCount).toBe(3);

      // Manually update a track status to simulate progress
      act(() => {
        const trackId = result.current.tracks[0].id;
        usePlaylistImportStore.getState().updateTrackStatus(trackId, 'done', 100);
      });

      expect(result.current.processedCount).toBe(1);
      expect(result.current.overallProgress).toBe(33); // Math.round(1/3 * 100)
      expect(result.current.pendingCount).toBe(2);
    });

    it('isFinished is true when all tracks are processed and not importing', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue(fakeResults as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      expect(result.current.isFinished).toBe(false);

      act(() => {
        const trackId = result.current.tracks[0].id;
        usePlaylistImportStore.getState().updateTrackStatus(trackId, 'done', 100);
      });

      expect(result.current.isFinished).toBe(true);
    });

    it('overallProgress is 0 when there are no tracks', () => {
      const { result } = renderHook(() => usePlaylistImport());
      expect(result.current.overallProgress).toBe(0);
    });
  });

  // --- Event listeners ---
  describe('event listeners', () => {
    it('registers onProgress listener on mount', () => {
      renderHook(() => usePlaylistImport());
      expect(window.electronAPI.downloader.onProgress).toHaveBeenCalled();
    });

    it('registers onExtractProgress listener on mount', () => {
      renderHook(() => usePlaylistImport());
      expect(window.electronAPI.playlist.onExtractProgress).toHaveBeenCalled();
    });

    it('calls cleanup function on unmount for onProgress', () => {
      const cleanupFn = vi.fn();
      vi.mocked(window.electronAPI.downloader.onProgress).mockReturnValue(cleanupFn);

      const { unmount } = renderHook(() => usePlaylistImport());
      unmount();

      expect(cleanupFn).toHaveBeenCalled();
    });

    it('calls cleanup function on unmount for onExtractProgress', () => {
      const cleanupFn = vi.fn();
      vi.mocked(window.electronAPI.playlist.onExtractProgress).mockReturnValue(cleanupFn);

      const { unmount } = renderHook(() => usePlaylistImport());
      unmount();

      expect(cleanupFn).toHaveBeenCalled();
    });
  });
});
