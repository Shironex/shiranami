import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataEnrichStore } from './useMetadataEnrichStore';
import { useLibraryStore } from './useLibraryStore';
import { usePlaybackStore } from './usePlaybackStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

describe('useMetadataEnrichStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMetadataEnrichStore.setState({
      isEnriching: false,
      isSingleTrackEnriching: false,
      progress: null,
      skippedIds: new Set(),
      skippedLoaded: false,
      lastRunResults: [],
    });
  });

  it('starts with default state', () => {
    const state = useMetadataEnrichStore.getState();
    expect(state.isEnriching).toBe(false);
    expect(state.progress).toBeNull();
    expect(state.skippedIds.size).toBe(0);
  });

  it('updateProgress sets progress', () => {
    useMetadataEnrichStore.getState().updateProgress({
      current: 5,
      total: 10,
      trackName: 'Test Track',
      status: 'searching',
    });

    const state = useMetadataEnrichStore.getState();
    expect(state.progress).toEqual({
      current: 5,
      total: 10,
      trackName: 'Test Track',
      status: 'searching',
    });
  });

  it('loadSkipped loads from electron store and prunes stale IDs', async () => {
    // Set up library with only one matching track
    useLibraryStore.setState({
      library: [
        {
          id: 'id-1',
          title: 'Track 1',
          artist: 'A',
          album: 'B',
          duration: 100,
          filePath: '/a.mp3',
        },
      ],
    });

    // electron store has two IDs, but only one exists in library
    vi.mocked(window.electronAPI.store.get).mockResolvedValueOnce(['id-1', 'id-stale']);

    await useMetadataEnrichStore.getState().loadSkipped();

    const state = useMetadataEnrichStore.getState();
    expect(state.skippedIds.has('id-1')).toBe(true);
    expect(state.skippedIds.has('id-stale')).toBe(false);
    expect(state.skippedLoaded).toBe(true);
    // Should persist pruned list
    expect(window.electronAPI.store.set).toHaveBeenCalledWith('metadata-enrich.skippedIds', [
      'id-1',
    ]);
  });

  it('loadSkipped does not reload if already loaded', async () => {
    useMetadataEnrichStore.setState({ skippedLoaded: true });

    await useMetadataEnrichStore.getState().loadSkipped();

    expect(window.electronAPI.store.get).not.toHaveBeenCalled();
  });

  it('startEnrichment shows toast when no tracks to enrich', async () => {
    useLibraryStore.setState({ library: [] });

    await useMetadataEnrichStore.getState().startEnrichment({
      onlyMissing: true,
      writeToFile: false,
      includeSkipped: false,
    });

    // Should not be enriching (empty library)
    expect(useMetadataEnrichStore.getState().isEnriching).toBe(false);
  });

  it('startEnrichment filters out skipped tracks when includeSkipped is false', async () => {
    useLibraryStore.setState({
      library: [
        {
          id: 'id-1',
          title: 'Track 1',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 100,
          filePath: '/a.mp3',
        },
        {
          id: 'id-2',
          title: 'Track 2',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 100,
          filePath: '/b.mp3',
        },
      ],
    });
    useMetadataEnrichStore.setState({
      skippedIds: new Set(['id-1']),
    });

    // Mock enrichTracks to capture what's passed
    const enrichMock = vi.mocked(window.electronAPI.metadata.enrichTracks);
    enrichMock.mockResolvedValueOnce([
      { id: 'id-2', success: false, updatedFields: {}, source: 'none' },
    ]);

    await useMetadataEnrichStore.getState().startEnrichment({
      onlyMissing: true,
      writeToFile: false,
      includeSkipped: false,
    });

    // Should only pass id-2 (id-1 is skipped)
    expect(enrichMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'id-2' })]),
      expect.any(Object)
    );
    expect(enrichMock.mock.calls[0][0]).toHaveLength(1);
  });

  // -------------------------------------------------------------
  // Per-track preview / apply actions
  // -------------------------------------------------------------
  describe('previewSingleTrack', () => {
    beforeEach(() => {
      useLibraryStore.setState({
        library: [
          {
            id: 'id-1',
            title: 'Song',
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 100,
            filePath: '/a.mp3',
          },
        ],
      });
    });

    it('calls previewEnrich with onlyMissing:true and returns the result', async () => {
      const previewMock = vi.mocked(window.electronAPI.metadata.previewEnrich);
      previewMock.mockResolvedValueOnce({
        id: 'id-1',
        success: true,
        updatedFields: { artist: 'Real Artist', album: 'Real Album' },
        source: 'itunes',
      });

      const result = await useMetadataEnrichStore.getState().previewSingleTrack('id-1');

      expect(previewMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-1' }), {
        onlyMissing: true,
      });
      expect(result.success).toBe(true);
      expect(result.updatedFields.artist).toBe('Real Artist');
      // flag should be reset after the call
      expect(useMetadataEnrichStore.getState().isSingleTrackEnriching).toBe(false);
    });

    it('throws when the track is not in the library', async () => {
      await expect(useMetadataEnrichStore.getState().previewSingleTrack('missing')).rejects.toThrow(
        /not found/
      );
    });

    it('looks the track up at call time, not via stale closure', async () => {
      const previewMock = vi.mocked(window.electronAPI.metadata.previewEnrich);
      previewMock.mockResolvedValue({
        id: 'id-2',
        success: false,
        updatedFields: {},
        source: 'none',
      });

      // Mutate the library after the action exists but before invocation;
      // the action must read the fresh state.
      useLibraryStore.setState({
        library: [
          {
            id: 'id-2',
            title: 'New',
            artist: 'A',
            album: 'B',
            duration: 100,
            filePath: '/x.mp3',
          },
        ],
      });

      await useMetadataEnrichStore.getState().previewSingleTrack('id-2');
      expect(previewMock.mock.calls[0][0].id).toBe('id-2');
    });
  });

  describe('applySingleTrack', () => {
    beforeEach(() => {
      useLibraryStore.setState({
        library: [
          {
            id: 'id-1',
            title: 'Song',
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 100,
            filePath: '/a.mp3',
          },
        ],
      });
    });

    it('writes DB updates without invoking enrichTracks when writeToFile is false', async () => {
      const updateManyMock = vi.mocked(window.electronAPI.db.tracks.updateMany);
      const enrichMock = vi.mocked(window.electronAPI.metadata.enrichTracks);
      const getAllMock = vi.mocked(window.electronAPI.db.tracks.getAll);
      getAllMock.mockResolvedValueOnce([
        {
          id: 'id-1',
          title: 'Song',
          artist: 'Real Artist',
          album: 'Real Album',
          duration: 100,
          filePath: '/a.mp3',
        },
      ] as never);

      await useMetadataEnrichStore
        .getState()
        .applySingleTrack(
          'id-1',
          { artist: 'Real Artist', album: 'Real Album' },
          { writeToFile: false }
        );

      expect(updateManyMock).toHaveBeenCalledWith([
        { id: 'id-1', data: { artist: 'Real Artist', album: 'Real Album' } },
      ]);
      expect(enrichMock).not.toHaveBeenCalled();
    });

    it('routes through enrichTracks (single-element array) when writeToFile is true', async () => {
      const enrichMock = vi.mocked(window.electronAPI.metadata.enrichTracks);
      enrichMock.mockResolvedValueOnce([
        {
          id: 'id-1',
          success: true,
          updatedFields: { artist: 'Real Artist' },
          source: 'itunes',
        },
      ]);
      vi.mocked(window.electronAPI.db.tracks.getAll).mockResolvedValueOnce([
        {
          id: 'id-1',
          title: 'Song',
          artist: 'Real Artist',
          album: 'Unknown Album',
          duration: 100,
          filePath: '/a.mp3',
        },
      ] as never);

      await useMetadataEnrichStore
        .getState()
        .applySingleTrack('id-1', { artist: 'Real Artist' }, { writeToFile: true });

      expect(enrichMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'id-1' })]),
        { writeToFile: true, onlyMissing: true }
      );
      expect(enrichMock.mock.calls[0][0]).toHaveLength(1);
    });

    it('throws when the track is no longer in the library at apply time', async () => {
      await expect(
        useMetadataEnrichStore
          .getState()
          .applySingleTrack('missing-id', { artist: 'A' }, { writeToFile: false })
      ).rejects.toThrow(/not found/);
    });

    it('throws when writeToFile is true and enrichTracks returns success: false', async () => {
      const enrichMock = vi.mocked(window.electronAPI.metadata.enrichTracks);
      enrichMock.mockResolvedValueOnce([
        { id: 'id-1', success: false, updatedFields: {}, source: 'none', error: 'Write failed' },
      ]);

      await expect(
        useMetadataEnrichStore
          .getState()
          .applySingleTrack('id-1', { artist: 'A' }, { writeToFile: true })
      ).rejects.toThrow(/Write failed/);
    });

    it('patches usePlaybackStore.currentTrack when the applied track is playing', async () => {
      usePlaybackStore.setState({
        currentTrack: {
          id: 'id-1',
          title: 'Song',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 100,
          filePath: '/a.mp3',
        },
        queue: [
          {
            id: 'id-1',
            title: 'Song',
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 100,
            filePath: '/a.mp3',
          },
        ],
      });

      vi.mocked(window.electronAPI.db.tracks.getAll).mockResolvedValueOnce([
        {
          id: 'id-1',
          title: 'Song',
          artist: 'Real Artist',
          album: 'Real Album',
          duration: 100,
          filePath: '/a.mp3',
        },
      ] as never);

      await useMetadataEnrichStore
        .getState()
        .applySingleTrack(
          'id-1',
          { artist: 'Real Artist', album: 'Real Album' },
          { writeToFile: false }
        );

      const playback = usePlaybackStore.getState();
      expect(playback.currentTrack?.artist).toBe('Real Artist');
      expect(playback.queue[0].artist).toBe('Real Artist');
    });
  });
});
