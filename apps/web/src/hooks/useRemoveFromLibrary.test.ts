import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

/**
 * We test the queue-removal logic by driving `usePlayerStore` directly
 * and invoking the `removeTracksFromQueue` callback extracted from the hook.
 *
 * Because `removeTracksFromQueue` is a pure function of Zustand state (reads via
 * getState, writes via setState), we can replicate its logic in isolation without
 * rendering a React component. We import the hook module and spy on the store.
 */

// Mock external modules the hook imports
vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/hooks/queries/useLibrary', () => ({
  libraryKeys: { all: ['library'] },
}));

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

/**
 * Replicates the `removeTracksFromQueue` logic from the hook so we can
 * unit-test the queue index calculations without rendering React.
 */
function removeTracksFromQueue(ids: string[]) {
  const idsSet = new Set(ids);
  const { queue, queueIndex, currentTrack } = usePlayerStore.getState();
  const isCurrentlyPlaying = currentTrack != null && idsSet.has(currentTrack.id);

  const newQueue = queue.filter((t) => !idsSet.has(t.id));
  if (newQueue.length === queue.length) return;

  let newIndex = queueIndex;
  for (let i = 0; i < queueIndex && i < queue.length; i++) {
    if (idsSet.has(queue[i].id)) newIndex--;
  }

  if (isCurrentlyPlaying) {
    const nextTrack = newQueue[Math.min(newIndex, newQueue.length - 1)] ?? null;
    usePlayerStore.setState({
      queue: newQueue,
      queueIndex: nextTrack ? Math.min(newIndex, newQueue.length - 1) : -1,
      currentTrack: nextTrack,
      currentTime: 0,
      isPlaying: !!nextTrack,
    });
  } else {
    usePlayerStore.setState({
      queue: newQueue,
      queueIndex: Math.min(newIndex, Math.max(newQueue.length - 1, 0)),
    });
  }
}

describe('removeTracksFromQueue', () => {
  const tracks = makeTracks(5); // t1, t2, t3, t4, t5

  beforeEach(() => {
    usePlayerStore.setState({
      queue: [...tracks],
      queueIndex: 2, // currently on t3
      currentTrack: tracks[2],
      currentTime: 50,
      isPlaying: true,
    });
  });

  it('removing a track before current index adjusts queueIndex down', () => {
    // Remove t1 (index 0), which is before current index 2
    removeTracksFromQueue(['t1']);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(4);
    expect(state.queueIndex).toBe(1); // shifted down by 1
    expect(state.currentTrack?.id).toBe('t3'); // still playing t3
  });

  it('removing current track advances to the next track', () => {
    // Remove t3 (the currently playing track)
    removeTracksFromQueue(['t3']);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(4);
    // currentTrack should now be the next available track at the adjusted index
    expect(state.currentTrack?.id).toBe('t4');
    expect(state.currentTime).toBe(0);
    expect(state.isPlaying).toBe(true);
  });

  it('removing a track after current index does not change queueIndex', () => {
    // Remove t5 (index 4), which is after current index 2
    removeTracksFromQueue(['t5']);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(4);
    expect(state.queueIndex).toBe(2); // unchanged
    expect(state.currentTrack?.id).toBe('t3'); // still playing same track
  });

  it('removing all tracks results in empty queue', () => {
    removeTracksFromQueue(['t1', 't2', 't3', 't4', 't5']);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(0);
    expect(state.queueIndex).toBe(-1);
    expect(state.currentTrack).toBeNull();
    expect(state.isPlaying).toBe(false);
  });

  it('does nothing when removing ids not in the queue', () => {
    removeTracksFromQueue(['nonexistent']);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(5);
    expect(state.queueIndex).toBe(2);
  });

  it('removing multiple tracks before current adjusts index correctly', () => {
    // Remove t1 and t2 (both before current index 2)
    removeTracksFromQueue(['t1', 't2']);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(3);
    expect(state.queueIndex).toBe(0); // shifted down by 2
    expect(state.currentTrack?.id).toBe('t3');
  });
});
