import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    title: `Track ${i + 1}`,
    artist: 'Artist',
    album: 'Album',
    duration: 200,
    filePath: `/music/track${i + 1}.mp3`,
  }));
}

const PLAYER_STATE_KEY = 'player-state';

/** Convenience: a valid persisted state matching makeTracks(3) with track 2 playing. */
function makePersistedState(overrides = {}) {
  return {
    currentTrackPath: '/music/track2.mp3',
    queuePaths: ['/music/track1.mp3', '/music/track2.mp3', '/music/track3.mp3'],
    queueIndex: 1,
    currentTime: 42.5,
    isPlaying: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helper tests (replicated from source since they are not exported)
// ---------------------------------------------------------------------------

describe('buildPersistedState (via store state)', () => {
  /**
   * Replicate the pure buildPersistedState logic so we can unit-test the
   * clamping / null-return behavior without rendering the hook.
   */
  function buildPersistedState() {
    const { currentTrack, queue, queueIndex, currentTime, isPlaying } = usePlaybackStore.getState();

    if (!currentTrack) {
      return null;
    }

    return {
      currentTrackPath: currentTrack.filePath,
      queuePaths: queue.map(track => track.filePath),
      queueIndex,
      currentTime: isFinite(currentTime) && currentTime >= 0 ? currentTime : 0,
      isPlaying,
    };
  }

  beforeEach(() => {
    usePlaybackStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      currentTime: 0,
      isPlaying: false,
    });
  });

  it('returns null when there is no current track', () => {
    expect(buildPersistedState()).toBeNull();
  });

  it('returns the correct shape when a track is playing', () => {
    const tracks = makeTracks(3);
    usePlaybackStore.setState({
      currentTrack: tracks[1],
      queue: tracks,
      queueIndex: 1,
      currentTime: 55.3,
      isPlaying: true,
    });

    expect(buildPersistedState()).toEqual({
      currentTrackPath: '/music/track2.mp3',
      queuePaths: ['/music/track1.mp3', '/music/track2.mp3', '/music/track3.mp3'],
      queueIndex: 1,
      currentTime: 55.3,
      isPlaying: true,
    });
  });

  it('clamps NaN currentTime to 0', () => {
    const tracks = makeTracks(1);
    usePlaybackStore.setState({
      currentTrack: tracks[0],
      queue: tracks,
      queueIndex: 0,
      currentTime: NaN,
      isPlaying: false,
    });

    expect(buildPersistedState()!.currentTime).toBe(0);
  });

  it('clamps Infinity currentTime to 0', () => {
    const tracks = makeTracks(1);
    usePlaybackStore.setState({
      currentTrack: tracks[0],
      queue: tracks,
      queueIndex: 0,
      currentTime: Infinity,
      isPlaying: false,
    });

    expect(buildPersistedState()!.currentTime).toBe(0);
  });

  it('clamps negative currentTime to 0', () => {
    const tracks = makeTracks(1);
    usePlaybackStore.setState({
      currentTrack: tracks[0],
      queue: tracks,
      queueIndex: 0,
      currentTime: -10,
      isPlaying: false,
    });

    expect(buildPersistedState()!.currentTime).toBe(0);
  });
});

describe('restoreQueueFromPaths (replicated)', () => {
  function restoreQueueFromPaths(
    library: Track[],
    persisted: { currentTrackPath: string; queuePaths: string[] }
  ): Track[] {
    const byPath = new Map(library.map(track => [track.filePath, track]));
    const restoredQueue = persisted.queuePaths
      .map(filePath => byPath.get(filePath))
      .filter((track): track is Track => Boolean(track));

    if (restoredQueue.length > 0) {
      return restoredQueue;
    }

    const currentTrack = byPath.get(persisted.currentTrackPath);
    return currentTrack ? [currentTrack] : [];
  }

  const library = makeTracks(5);

  it('restores tracks that exist in the library', () => {
    const result = restoreQueueFromPaths(library, {
      currentTrackPath: '/music/track2.mp3',
      queuePaths: ['/music/track2.mp3', '/music/track4.mp3'],
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('t2');
    expect(result[1].id).toBe('t4');
  });

  it('filters out paths not in the library', () => {
    const result = restoreQueueFromPaths(library, {
      currentTrackPath: '/music/track1.mp3',
      queuePaths: ['/music/track1.mp3', '/music/deleted.mp3', '/music/track3.mp3'],
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('t1');
    expect(result[1].id).toBe('t3');
  });

  it('falls back to a single-track queue containing currentTrack when no queuePaths resolve', () => {
    const result = restoreQueueFromPaths(library, {
      currentTrackPath: '/music/track3.mp3',
      queuePaths: ['/music/gone1.mp3', '/music/gone2.mp3'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t3');
  });

  it('falls back to a single-track queue on empty queuePaths when currentTrack is in library', () => {
    const result = restoreQueueFromPaths(library, {
      currentTrackPath: '/music/track2.mp3',
      queuePaths: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t2');
  });

  it('returns empty array when queuePaths are stale and currentTrackPath is not in library', () => {
    const result = restoreQueueFromPaths(library, {
      currentTrackPath: '/music/gone.mp3',
      queuePaths: [],
    });

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hook integration tests
// ---------------------------------------------------------------------------

describe('usePlaybackResume hook', () => {
  const tracks = makeTracks(3);

  beforeEach(() => {
    vi.useFakeTimers();

    // Reset stores to clean state
    useLibraryStore.setState({ library: [] });
    usePlaybackStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      currentTime: 0,
      isPlaying: false,
      _seekTarget: null,
      error: null,
    });

    // Reset electronAPI mocks
    vi.mocked(window.electronAPI.store.get).mockReset();
    vi.mocked(window.electronAPI.store.set).mockReset();
    vi.mocked(window.electronAPI.store.delete).mockReset();
    vi.mocked(window.electronAPI.store.get).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.store.set).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.store.delete).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // enabled = false
  // -------------------------------------------------------------------------

  it('does nothing when enabled is false', async () => {
    const { usePlaybackResume } = await import('./usePlaybackResume');

    renderHook(() => usePlaybackResume(false));

    // Allow any pending microtasks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // store.get IS called (the settings-load effect runs regardless of `enabled`),
    // but the restore effect and persist interval should not touch set/delete
    // since the hook guards on `enabled`.
    expect(window.electronAPI.store.set).not.toHaveBeenCalled();
    expect(window.electronAPI.store.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Settings & persisted state loading on mount
  // -------------------------------------------------------------------------

  it('reads settings and persisted state from electronAPI.store on mount', async () => {
    const { usePlaybackResume } = await import('./usePlaybackResume');

    renderHook(() => usePlaybackResume());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(window.electronAPI.store.get).toHaveBeenCalledWith('settings');
    expect(window.electronAPI.store.get).toHaveBeenCalledWith(PLAYER_STATE_KEY);
  });

  // -------------------------------------------------------------------------
  // Periodic persistence
  // -------------------------------------------------------------------------

  it('persists state on a 1-second interval when ready', async () => {
    // Return settings with rememberPlaybackPosition OFF so restore resolves immediately,
    // letting the persist-interval effect activate.
    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: false };
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    // Set a current track so buildPersistedState returns non-null
    usePlaybackStore.setState({
      currentTrack: tracks[0],
      queue: tracks,
      queueIndex: 0,
      currentTime: 10,
      isPlaying: true,
    });

    renderHook(() => usePlaybackResume(true));

    // Let the settings load resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Reset to only count calls from the interval
    vi.mocked(window.electronAPI.store.set).mockClear();

    // Advance 3 seconds -> 3 interval ticks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Should have been called at least 3 times from the interval
    const setCalls = vi
      .mocked(window.electronAPI.store.set)
      .mock.calls.filter(call => call[0] === PLAYER_STATE_KEY);
    expect(setCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('calls store.delete when there is no current track during persist', async () => {
    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: false };
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    // No current track -> buildPersistedState returns null
    usePlaybackStore.setState({ currentTrack: null });

    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    vi.mocked(window.electronAPI.store.delete).mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const deleteCalls = vi
      .mocked(window.electronAPI.store.delete)
      .mock.calls.filter(call => call[0] === PLAYER_STATE_KEY);
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Restore from persisted state
  // -------------------------------------------------------------------------

  it('restores player state from persisted data when library is populated', async () => {
    const persisted = makePersistedState();

    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: true };
      if (key === PLAYER_STATE_KEY) return persisted;
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    renderHook(() => usePlaybackResume(true));

    // Let settings load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Simulate library becoming available (e.g. after DB load)
    act(() => {
      useLibraryStore.setState({ library: tracks });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const state = usePlaybackStore.getState();
    expect(state.currentTrack?.filePath).toBe('/music/track2.mp3');
    expect(state.queue).toHaveLength(3);
    expect(state.currentTime).toBe(42.5);
    expect(state._seekTarget).toBe(42.5);
    expect(state.isPlaying).toBe(true);
  });

  it('does not restore when library is empty', async () => {
    const persisted = makePersistedState();

    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: true };
      if (key === PLAYER_STATE_KEY) return persisted;
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    // Library stays empty
    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const state = usePlaybackStore.getState();
    expect(state.currentTrack).toBeNull();
  });

  it('does not restore twice (guard against double-restore)', async () => {
    const persisted = makePersistedState();

    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: true };
      if (key === PLAYER_STATE_KEY) return persisted;
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    const { rerender } = renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Populate library to trigger restore
    act(() => {
      useLibraryStore.setState({ library: tracks });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(usePlaybackStore.getState().currentTrack?.filePath).toBe('/music/track2.mp3');

    // Manually clear the track and change library to try triggering a second restore
    act(() => {
      usePlaybackStore.setState({
        currentTrack: null,
        queue: [],
        queueIndex: -1,
        currentTime: 0,
      });
    });

    // Re-set the library to trigger the effect dependencies
    act(() => {
      useLibraryStore.setState({ library: [...tracks] });
    });

    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should NOT have restored again — currentTrack should remain null
    expect(usePlaybackStore.getState().currentTrack).toBeNull();
  });

  it('skips restore when currentTrackPath is not found in library', async () => {
    const persisted = makePersistedState({
      currentTrackPath: '/music/nonexistent.mp3',
    });

    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: true };
      if (key === PLAYER_STATE_KEY) return persisted;
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    // Populate library right away
    useLibraryStore.setState({ library: tracks });

    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Restore should have been attempted but skipped because currentTrackPath not found
    expect(usePlaybackStore.getState().currentTrack).toBeNull();
  });

  it('restores to a single-track queue when queuePaths are stale but currentTrackPath is in library', async () => {
    // Persisted state where queuePaths are all deleted but the current track still exists.
    const persisted = makePersistedState({
      currentTrackPath: '/music/track2.mp3',
      queuePaths: ['/music/deleted1.mp3', '/music/deleted2.mp3'],
      queueIndex: 0,
    });

    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: true };
      if (key === PLAYER_STATE_KEY) return persisted;
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    useLibraryStore.setState({ library: tracks });

    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const state = usePlaybackStore.getState();
    expect(state.currentTrack?.filePath).toBe('/music/track2.mp3');
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].filePath).toBe('/music/track2.mp3');
  });

  it('clamps non-finite persisted currentTime to 0 during restore', async () => {
    const persisted = makePersistedState({ currentTime: NaN });

    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: true };
      if (key === PLAYER_STATE_KEY) return persisted;
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    useLibraryStore.setState({ library: tracks });

    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(usePlaybackStore.getState().currentTime).toBe(0);
    expect(usePlaybackStore.getState()._seekTarget).toBe(0);
  });

  it('resolves restore immediately when rememberPlaybackPosition is off', async () => {
    vi.mocked(window.electronAPI.store.get).mockImplementation(async key => {
      if (key === 'settings') return { rememberPlaybackPosition: false };
      return undefined;
    });

    const { usePlaybackResume } = await import('./usePlaybackResume');

    const tracks2 = makeTracks(2);
    useLibraryStore.setState({ library: tracks2 });
    usePlaybackStore.setState({
      currentTrack: tracks2[0],
      queue: tracks2,
      queueIndex: 0,
      currentTime: 5,
      isPlaying: true,
    });

    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Persist interval should be active since restore resolved immediately.
    vi.mocked(window.electronAPI.store.set).mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    const setCalls = vi
      .mocked(window.electronAPI.store.set)
      .mock.calls.filter(call => call[0] === PLAYER_STATE_KEY);
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('handles settings load failure gracefully', async () => {
    vi.mocked(window.electronAPI.store.get).mockRejectedValue(new Error('store error'));

    const { usePlaybackResume } = await import('./usePlaybackResume');

    renderHook(() => usePlaybackResume(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should not throw; player should remain in default state
    expect(usePlaybackStore.getState().currentTrack).toBeNull();
  });
});
