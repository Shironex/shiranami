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
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import { useDownloadBatchStore } from '@/stores/useDownloadBatchStore';
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
    vi.mocked(window.electronAPI.downloader.enqueueDownload).mockReset();
    vi.mocked(window.electronAPI.downloader.cancelDownload).mockReset();
    vi.mocked(window.electronAPI.playlist.onExtractProgress).mockReset();
    vi.mocked(window.electronAPI.db.tracks.exists).mockReset();
    vi.mocked(window.electronAPI.library.parseMetadata).mockReset();
    vi.mocked(window.electronAPI.db.tracks.add).mockReset();
    useDownloadQueueStore
      .getState()
      .applySnapshot({ items: [], maxConcurrency: 3, activeCount: 0 });
    useDownloadBatchStore.setState({ batches: {} });

    // Default mock returns for event listeners
    vi.mocked(window.electronAPI.playlist.onExtractProgress).mockReturnValue(vi.fn());
    vi.mocked(window.electronAPI.downloader.enqueueDownload).mockImplementation(
      async () => `item-${Math.random().toString(36).slice(2)}`
    );

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: [],
      } as never);

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
      let resolveExtract!: (value: { title: string | null; tracks: SearchResult[] }) => void;
      vi.mocked(window.electronAPI.playlist.extract).mockImplementation(
        () =>
          new Promise(resolve => {
            resolveExtract = resolve;
          })
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
        resolveExtract({ title: null, tracks: [makeSearchResult('v1')] });
        await extractPromise!;
      });

      expect(result.current.isExtracting).toBe(false);
    });

    it('clears previous extractError on new extraction', async () => {
      vi.mocked(window.electronAPI.playlist.extract)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ title: null, tracks: [makeSearchResult('v1')] } as never);

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

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

  // --- handleStartImport (batch enqueue) ---
  describe('handleStartImport', () => {
    beforeEach(() => {
      vi.mocked(window.electronAPI.downloader.enqueueDownload).mockReset();
      vi.mocked(window.electronAPI.downloader.enqueueDownload).mockImplementation(
        async () => `item-${Math.random().toString(36).slice(2)}`
      );
      useDownloadBatchStore.setState({ batches: {} });
    });

    it('enqueues every pending track with a shared batchId + ordered batchIndex', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        result.current.handleStartImport();
      });

      const enqueue = vi.mocked(window.electronAPI.downloader.enqueueDownload);
      expect(enqueue).toHaveBeenCalledTimes(3);

      const calls = enqueue.mock.calls.map(c => c[0]);
      // Same batchId across the whole import.
      const batchIds = new Set(calls.map(c => c.batchId));
      expect(batchIds.size).toBe(1);
      // batchIndex follows source playlist order.
      expect(calls.map(c => c.batchIndex)).toEqual([0, 1, 2]);
      // url passed is webpage_url (the canonical queue key).
      expect(calls.map(c => c.url)).toEqual([
        'https://example.com/watch/v1',
        'https://example.com/watch/v2',
        'https://example.com/watch/v3',
      ]);
    });

    it('registers a batch with the source title + createPlaylist flag', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: 'My Playlist',
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        result.current.handleStartImport();
      });

      const batches = Object.values(useDownloadBatchStore.getState().batches);
      expect(batches).toHaveLength(1);
      expect(batches[0].sourceTitle).toBe('My Playlist');
      expect(batches[0].createPlaylist).toBe(true);
    });

    it('seals the batch with the actually-enqueued ids after enqueues settle', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        result.current.handleStartImport();
        // Let the enqueue promises + sealBatch settle.
        await Promise.resolve();
        await Promise.resolve();
      });

      const batch = Object.values(useDownloadBatchStore.getState().batches)[0];
      expect(batch.sealed).toBe(true);
      expect(batch.enqueuedIds.size).toBe(2);
    });

    it('marks pending tracks downloading and does nothing with no pending tracks', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      // Mark the only track done so nothing is pending.
      act(() => {
        usePlaylistImportStore
          .getState()
          .updateTrackStatus(result.current.tracks[0].id, 'done', 100);
      });

      await act(async () => {
        result.current.handleStartImport();
      });

      expect(window.electronAPI.downloader.enqueueDownload).not.toHaveBeenCalled();
    });
  });

  // --- handleStartImportSelected (batch enqueue) ---
  describe('handleStartImportSelected', () => {
    beforeEach(() => {
      vi.mocked(window.electronAPI.downloader.enqueueDownload).mockReset();
      vi.mocked(window.electronAPI.downloader.enqueueDownload).mockImplementation(
        async () => `item-${Math.random().toString(36).slice(2)}`
      );
      useDownloadBatchStore.setState({ batches: {} });
    });

    it('only enqueues selected tracks', async () => {
      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      const selectedIds = new Set([result.current.tracks[0].id, result.current.tracks[2].id]);

      await act(async () => {
        result.current.handleStartImportSelected(selectedIds);
      });

      const enqueue = vi.mocked(window.electronAPI.downloader.enqueueDownload);
      expect(enqueue).toHaveBeenCalledTimes(2);
      expect(enqueue.mock.calls.map(c => c[0].url)).toEqual([
        'https://example.com/watch/v1',
        'https://example.com/watch/v3',
      ]);
    });

    it('does nothing when selectedIds is empty', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        result.current.handleStartImportSelected(new Set());
      });

      expect(window.electronAPI.downloader.enqueueDownload).not.toHaveBeenCalled();
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

    it('cancels every non-terminal queue item in the active batch', async () => {
      vi.mocked(window.electronAPI.downloader.enqueueDownload).mockReset();
      vi.mocked(window.electronAPI.downloader.cancelDownload).mockReset();
      vi.mocked(window.electronAPI.downloader.cancelDownload).mockResolvedValue(undefined);
      useDownloadBatchStore.setState({ batches: {} });

      let nextId = 0;
      vi.mocked(window.electronAPI.downloader.enqueueDownload).mockImplementation(
        async () => `item-${nextId++}`
      );

      const fakeResults = [makeSearchResult('v1'), makeSearchResult('v2'), makeSearchResult('v3')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      await act(async () => {
        result.current.handleStartImport();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Simulate the main-process queue: one active, one queued, one already done.
      act(() => {
        useDownloadQueueStore.getState().applySnapshot({
          maxConcurrency: 3,
          activeCount: 1,
          items: [
            {
              id: 'item-0',
              url: 'https://example.com/watch/v1',
              title: 'Title v1',
              status: 'active',
              progress: 40,
              batchId: Object.keys(useDownloadBatchStore.getState().batches)[0],
              batchIndex: 0,
              enqueuedAt: 1,
            },
            {
              id: 'item-1',
              url: 'https://example.com/watch/v2',
              title: 'Title v2',
              status: 'queued',
              progress: 0,
              batchId: Object.keys(useDownloadBatchStore.getState().batches)[0],
              batchIndex: 1,
              enqueuedAt: 2,
            },
            {
              id: 'item-2',
              url: 'https://example.com/watch/v3',
              title: 'Title v3',
              status: 'done',
              progress: 100,
              filePath: '/music/v3.mp3',
              batchId: Object.keys(useDownloadBatchStore.getState().batches)[0],
              batchIndex: 2,
              enqueuedAt: 3,
            },
          ],
        });
      });

      act(() => {
        result.current.handleCancel();
      });

      expect(window.electronAPI.playlist.cancel).toHaveBeenCalled();
      const cancel = vi.mocked(window.electronAPI.downloader.cancelDownload);
      const cancelledIds = cancel.mock.calls.map(c => c[0]);
      expect(cancelledIds).toContain('item-0');
      expect(cancelledIds).toContain('item-1');
      // The already-done item is not cancelled.
      expect(cancelledIds).not.toContain('item-2');
    });
  });

  // --- handleReset ---
  describe('handleReset', () => {
    it('resets all state to initial values', async () => {
      const fakeResults = [makeSearchResult('v1')];
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

      const { result } = renderHook(() => usePlaylistImport());

      act(() => {
        result.current.setUrl('https://youtube.com/playlist?list=PL123');
      });
      await act(async () => {
        await result.current.handleExtract();
      });

      const idsToRemove = new Set([result.current.tracks[0].id, result.current.tracks[2].id]);

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

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
      vi.mocked(window.electronAPI.playlist.extract).mockResolvedValue({
        title: null,
        tracks: fakeResults,
      } as never);

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
    it('registers onExtractProgress listener on mount', () => {
      renderHook(() => usePlaylistImport());
      expect(window.electronAPI.playlist.onExtractProgress).toHaveBeenCalled();
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
