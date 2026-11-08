import { attachTransport, usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { useQueueToastStore } from '@/stores/useQueueToastStore';
import { UNDO_WINDOW_MS } from '@/stores/useRemovalStore';

const track = (id: string): Track =>
  ({ id, title: id, artist: 'Artist', album: '', duration: 120, filePath: `/${id}.mp3` }) as Track;

const [a, b, c, x] = ['a', 'b', 'c', 'x'].map(track);
const player = () => usePlayerStore.getState();
const toast = () => useQueueToastStore.getState();
const queueIds = () => player().queue.map(t => t.id);

const initialPlayer = usePlayerStore.getState();
let detach: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  usePlayerStore.setState(initialPlayer, true);
  useQueueToastStore.setState({ toast: null });
  detach = attachTransport({
    load: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    stop: jest.fn(),
    setVolume: jest.fn(),
  });
});

afterEach(() => {
  toast().dismiss();
  detach();
  jest.useRealTimers();
});

describe('swipe to play next', () => {
  it('puts the song right after the one playing and offers undo', () => {
    player().playFromList([a, b, c], 0);
    toast().playNext(x);

    expect(queueIds()).toEqual(['a', 'x', 'b', 'c']);
    expect(player().currentTrack?.id).toBe('a');
    expect(toast().toast?.text).toBe('Playing next: x');
  });

  it('undo takes the song back out and leaves playback alone', () => {
    player().playFromList([a, b, c], 1);
    toast().playNext(x);
    toast().undo();

    expect(queueIds()).toEqual(['a', 'b', 'c']);
    expect(player().currentTrack?.id).toBe('b');
    expect(toast().toast).toBeNull();
  });

  it('undo removes only the added copy when the song is already in the queue', () => {
    player().playFromList([a, b, c], 0);
    toast().playNext(c);
    expect(queueIds()).toEqual(['a', 'c', 'b', 'c']);

    toast().undo();
    expect(queueIds()).toEqual(['a', 'b', 'c']);
  });

  it('undo keeps a song that has started playing', () => {
    player().playFromList([a, b], 0);
    toast().playNext(x);
    player().next();
    expect(player().currentTrack?.id).toBe('x');

    toast().undo();
    expect(player().currentTrack?.id).toBe('x');
    expect(queueIds()).toEqual(['a', 'x', 'b']);
  });

  it('plays the song when nothing is playing, and undo stops it', () => {
    toast().playNext(x);
    expect(player().currentTrack?.id).toBe('x');
    expect(toast().toast?.text).toBe('Playing x');

    toast().undo();
    expect(player().currentTrack).toBeNull();
    expect(queueIds()).toEqual([]);
  });

  it('the toast goes away after the undo window', () => {
    player().playFromList([a], 0);
    toast().playNext(x);
    jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(toast().toast).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(toast().toast).toBeNull();
    // Undo after the window does nothing.
    toast().undo();
    expect(queueIds()).toEqual(['a', 'x']);
  });

  it('a second swipe replaces the toast, and undo applies to the latest song', () => {
    player().playFromList([a, b], 0);
    toast().playNext(x);
    toast().playNext(c);
    expect(queueIds()).toEqual(['a', 'c', 'x', 'b']);

    toast().undo();
    expect(queueIds()).toEqual(['a', 'x', 'b']);
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(toast().toast).toBeNull();
  });
});

describe('undo stays safe when things change after the swipe', () => {
  it('a song started by the swipe: playing something else closes the toast and keeps it', () => {
    toast().playNext(x);
    player().playFromList([a, b], 0);

    expect(toast().toast).toBeNull();
    toast().undo();
    expect(player().currentTrack?.id).toBe('a');
    expect(queueIds()).toEqual(['a', 'b']);
  });

  it('a song started by the swipe: adding to the queue closes the toast', () => {
    toast().playNext(x);
    player().addToQueue([a]);

    expect(toast().toast).toBeNull();
    toast().undo();
    expect(queueIds()).toEqual(['x', 'a']);
    expect(player().currentTrack?.id).toBe('x');
  });

  it('a song queued next: replacing the queue closes the toast', () => {
    player().playFromList([a, b], 0);
    toast().playNext(x);
    player().playFromList([c], 0);

    expect(toast().toast).toBeNull();
    toast().undo();
    expect(queueIds()).toEqual(['c']);
  });

  it('a stale undo does nothing even if it is still held', () => {
    toast().playNext(x);
    const held = toast().toast!;
    player().playFromList([a, b], 1);

    held.undo();
    expect(player().currentTrack?.id).toBe('b');
    expect(queueIds()).toEqual(['a', 'b']);
  });

  it('progress and pausing leave the toast up', () => {
    toast().playNext(x);
    player().pause();
    usePlayerStore.setState({ currentTime: 12 });

    expect(toast().toast).not.toBeNull();
    toast().undo();
    expect(player().currentTrack).toBeNull();
  });
});
