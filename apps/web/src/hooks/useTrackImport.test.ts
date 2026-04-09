import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/hooks/queries/useLibrary', () => ({
  libraryKeys: { all: ['library'] },
}));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { useTrackImport } from '@/hooks/useTrackImport';
import { queryClient } from '@/lib/queryClient';

const fakeMetadata = {
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 210,
  genre: 'Rock',
  year: 2024,
  trackNumber: 1,
  discNumber: 1,
  albumArt: null,
};

const fakeDbTrack: Record<string, unknown> = {
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

function resetMocks() {
  vi.mocked(window.electronAPI.library.parseMetadata).mockResolvedValue({
    metadata: fakeMetadata,
  } as never);
  vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(false as never);
  vi.mocked(window.electronAPI.db.tracks.add).mockResolvedValue(fakeDbTrack as never);
  vi.mocked(queryClient.invalidateQueries).mockClear();
}

describe('useTrackImport', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      library: [],
      queue: [],
      queueIndex: -1,
      currentTrack: null,
      isPlaying: false,
    });
    resetMocks();
  });

  it('returns null when the track already exists', async () => {
    vi.mocked(window.electronAPI.db.tracks.exists).mockResolvedValue(true as never);

    const { result } = renderHook(() => useTrackImport());

    let track: Track | null = null;
    await act(async () => {
      track = await result.current.importTrack('/music/song.mp3');
    });

    expect(track).toBeNull();
    expect(window.electronAPI.db.tracks.add).not.toHaveBeenCalled();
  });

  it('parses metadata, inserts into DB, and adds to library on success', async () => {
    const { result } = renderHook(() => useTrackImport());

    let track: Track | null = null;
    await act(async () => {
      track = await result.current.importTrack('/music/song.mp3');
    });

    expect(window.electronAPI.library.parseMetadata).toHaveBeenCalledWith('/music/song.mp3');
    expect(window.electronAPI.db.tracks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/music/song.mp3',
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 210,
      })
    );
    expect(track).not.toBeNull();
    expect(track!.id).toBe('track-1');

    const state = usePlayerStore.getState();
    expect(state.library).toHaveLength(1);
    expect(state.library[0].id).toBe('track-1');
  });

  it('appends track to queue and sets it as current when nothing is playing', async () => {
    const { result } = renderHook(() => useTrackImport());

    await act(async () => {
      await result.current.importTrack('/music/song.mp3');
    });

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].id).toBe('track-1');
    // setQueue with startIndex = newQueue.length - 1 means currentTrack set
    expect(state.currentTrack?.id).toBe('track-1');
  });

  it('appends track to queue without changing current track when something is playing', async () => {
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

    const { result } = renderHook(() => useTrackImport());

    await act(async () => {
      await result.current.importTrack('/music/song.mp3');
    });

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(2);
    expect(state.queue[1].id).toBe('track-1');
    // Current track should remain unchanged
    expect(state.currentTrack?.id).toBe('existing-1');
  });

  it('invalidates library query cache after import', async () => {
    const { result } = renderHook(() => useTrackImport());

    await act(async () => {
      await result.current.importTrack('/music/song.mp3');
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['library'],
    });
  });
});
