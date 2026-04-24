import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMetadataEnrichStore } from './useMetadataEnrichStore';
import { useLibraryStore } from './useLibraryStore';

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
      progress: null,
      skippedIds: new Set(),
      skippedLoaded: false,
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

  it('clearSkipped resets skipped IDs and persists', async () => {
    useMetadataEnrichStore.setState({
      skippedIds: new Set(['id-1', 'id-2']),
    });

    await useMetadataEnrichStore.getState().clearSkipped();

    expect(useMetadataEnrichStore.getState().skippedIds.size).toBe(0);
    expect(window.electronAPI.store.set).toHaveBeenCalledWith(
      'metadata-enrich.skippedIds',
      []
    );
  });

  it('loadSkipped loads from electron store and prunes stale IDs', async () => {
    // Set up library with only one matching track
    useLibraryStore.setState({
      library: [
        { id: 'id-1', title: 'Track 1', artist: 'A', album: 'B', duration: 100, filePath: '/a.mp3' },
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
    expect(window.electronAPI.store.set).toHaveBeenCalledWith(
      'metadata-enrich.skippedIds',
      ['id-1']
    );
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
        { id: 'id-1', title: 'Track 1', artist: 'Unknown Artist', album: 'Unknown Album', duration: 100, filePath: '/a.mp3' },
        { id: 'id-2', title: 'Track 2', artist: 'Unknown Artist', album: 'Unknown Album', duration: 100, filePath: '/b.mp3' },
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
      expect.arrayContaining([
        expect.objectContaining({ id: 'id-2' }),
      ]),
      expect.any(Object)
    );
    expect(enrichMock.mock.calls[0][0]).toHaveLength(1);
  });
});
