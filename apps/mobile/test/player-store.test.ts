import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

const initialState = usePlayerStore.getState();

function track(id: string): Track {
  return {
    id,
    title: id,
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    filePath: `file:///${id}.mp3`,
  };
}

const [a, b, c] = ['a', 'b', 'c'].map(track);

beforeEach(() => {
  usePlayerStore.setState(initialState, true);
});

describe('usePlayerStore queue', () => {
  it('starts playing the chosen track when a queue is set', () => {
    usePlayerStore.getState().setQueue([a, b, c], 1);
    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('b');
    expect(state.queueIndex).toBe(1);
    expect(state.isPlaying).toBe(true);
  });

  it('stops at the end of the queue when repeat is off', () => {
    usePlayerStore.getState().setQueue([a, b], 1);
    usePlayerStore.getState().next();
    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('b');
    expect(state.isPlaying).toBe(false);
  });

  it('wraps to the first track when repeat is all', () => {
    usePlayerStore.getState().setQueue([a, b], 1);
    usePlayerStore.getState().cycleRepeatMode();
    expect(usePlayerStore.getState().repeatMode).toBe('all');
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().currentTrack?.id).toBe('a');
  });

  it('restarts the current track instead of going back after three seconds', () => {
    usePlayerStore.getState().setQueue([a, b], 1);
    usePlayerStore.getState().seek(42);
    usePlayerStore.getState().previous();
    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('b');
    expect(state.currentTime).toBe(0);
  });

  it('replays the same track on track end when repeat is one', () => {
    usePlayerStore.getState().setQueue([a, b], 0);
    usePlayerStore.setState({ repeatMode: 'one', currentTime: 170 });
    usePlayerStore.getState()._onTrackEnd();
    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('a');
    expect(state.currentTime).toBe(0);
  });

  it('moves to the next track when the playing one is removed', () => {
    usePlayerStore.getState().setQueue([a, b, c], 1);
    usePlayerStore.getState().removeFromQueue(1);
    const state = usePlayerStore.getState();
    expect(state.queue.map(t => t.id)).toEqual(['a', 'c']);
    expect(state.currentTrack?.id).toBe('c');
  });

  it('keeps the playing track selected when the queue is reordered', () => {
    usePlayerStore.getState().setQueue([a, b, c], 0);
    usePlayerStore.getState().reorderQueue(0, 2);
    const state = usePlayerStore.getState();
    expect(state.queue.map(t => t.id)).toEqual(['b', 'c', 'a']);
    expect(state.queue[state.queueIndex].id).toBe('a');
  });
});
