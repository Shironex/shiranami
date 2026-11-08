import {
  attachTransport,
  usePlayerStore,
  type PlayerTransport,
  type Track,
} from '@/stores/usePlayerStore';

const initialState = usePlayerStore.getState();

function track(id: string, extra: Partial<Track> = {}): Track {
  return {
    id,
    title: id,
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    filePath: `file:///${id}.mp3`,
    ...extra,
  };
}

const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => track(id));
const store = () => usePlayerStore.getState();
const ids = (tracks: Track[]) => tracks.map(t => t.id);

let transport: jest.Mocked<PlayerTransport>;
let detach: () => void;

beforeEach(() => {
  usePlayerStore.setState(initialState, true);
  transport = {
    load: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    stop: jest.fn(),
    setVolume: jest.fn(),
  };
  detach = attachTransport(transport);
});

afterEach(() => detach());

describe('playing from a list', () => {
  it('loads and plays the tapped track with the whole list as the queue', () => {
    store().playFromList([a, b, c], 1);

    expect(store().currentTrack?.id).toBe('b');
    expect(store().queueIndex).toBe(1);
    expect(store().isPlaying).toBe(true);
    expect(transport.load).toHaveBeenCalledWith(b);
    expect(transport.play).toHaveBeenCalled();
  });

  it('puts the tapped track first and shuffles the rest while shuffle is on', () => {
    store().toggleShuffle();
    store().playFromList([a, b, c, d], 2);

    expect(store().currentTrack?.id).toBe('c');
    expect(store().queueIndex).toBe(0);
    expect(ids(store().queue).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(store().queue[0].id).toBe('c');
  });
});

describe('next and previous', () => {
  it('skips to the next track', () => {
    store().playFromList([a, b, c], 0);
    store().next();
    expect(store().currentTrack?.id).toBe('b');
    expect(transport.load).toHaveBeenLastCalledWith(b);
  });

  it('stops at the end of the queue when repeat is off', () => {
    store().playFromList([a, b], 1);
    transport.load.mockClear();
    store().next();

    expect(store().currentTrack?.id).toBe('b');
    expect(store().isPlaying).toBe(false);
    expect(transport.load).not.toHaveBeenCalled();
    expect(transport.pause).toHaveBeenCalled();
  });

  it('wraps to the first track when repeat is all', () => {
    store().playFromList([a, b], 1);
    store().cycleRepeatMode();
    expect(store().repeatMode).toBe('all');
    store().next();
    expect(store().currentTrack?.id).toBe('a');
  });

  it('restarts the track instead of going back once it has played a few seconds', () => {
    store().playFromList([a, b], 1);
    store()._syncPlayback({ isPlaying: true, isBuffering: false, currentTime: 42, duration: 180 });
    store().previous();

    expect(store().currentTrack?.id).toBe('b');
    expect(transport.seekTo).toHaveBeenLastCalledWith(0);
  });

  it('goes to the previous track near the start', () => {
    store().playFromList([a, b], 1);
    store().previous();
    expect(store().currentTrack?.id).toBe('a');
  });

  it('restarts the first track rather than wrapping when repeat is off', () => {
    store().playFromList([a, b], 0);
    store().previous();
    expect(store().currentTrack?.id).toBe('a');
    expect(transport.seekTo).toHaveBeenLastCalledWith(0);
  });
});

describe('track end', () => {
  it('advances to the next track', () => {
    store().playFromList([a, b], 0);
    store()._onTrackEnd();
    expect(store().currentTrack?.id).toBe('b');
    expect(store().isPlaying).toBe(true);
  });

  it('replays the same track when repeat is one', () => {
    store().playFromList([a, b], 0);
    store().cycleRepeatMode();
    store().cycleRepeatMode();
    expect(store().repeatMode).toBe('one');
    transport.load.mockClear();
    store()._onTrackEnd();

    expect(store().currentTrack?.id).toBe('a');
    expect(transport.load).not.toHaveBeenCalled();
    expect(transport.seekTo).toHaveBeenLastCalledWith(0);
    expect(transport.play).toHaveBeenCalled();
  });

  it('stops after the last track when repeat is off', () => {
    store().playFromList([a], 0);
    store()._onTrackEnd();
    expect(store().isPlaying).toBe(false);
  });
});

describe('shuffle', () => {
  it('keeps the current track and restores the original order when turned off', () => {
    store().playFromList([a, b, c, d], 2);
    store().toggleShuffle();
    expect(store().queue[0].id).toBe('c');
    expect(store().queueIndex).toBe(0);

    store().toggleShuffle();
    expect(ids(store().queue)).toEqual(['a', 'b', 'c', 'd']);
    expect(store().queueIndex).toBe(2);
  });

  it('keeps a track removed while shuffled out of the restored order', () => {
    store().playFromList([a, b, c, d], 2);
    store().toggleShuffle();
    store().removeFromQueue(ids(store().queue).indexOf('b'));

    store().toggleShuffle();
    expect(ids(store().queue)).toEqual(['a', 'c', 'd']);
    expect(store().queue[store().queueIndex].id).toBe('c');
  });

  it('keeps a track added with play next while shuffled, at the end', () => {
    const e = track('e');
    store().playFromList([a, b, c, d], 2);
    store().toggleShuffle();
    store().playNext(e);

    store().toggleShuffle();
    expect(ids(store().queue)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(store().queue[store().queueIndex].id).toBe('c');
  });

  it('keeps a duplicate added with play next while shuffled', () => {
    store().playFromList([a, b, c], 1);
    store().toggleShuffle();
    store().playNext(a);

    store().toggleShuffle();
    expect(ids(store().queue)).toEqual(['a', 'b', 'c', 'a']);
    expect(store().queueIndex).toBe(1);
  });

  it('keeps favorite changes made while shuffled', () => {
    store().playFromList([a, b, c, d], 0);
    store().toggleShuffle();
    store().toggleFavorite('d');

    store().toggleShuffle();
    expect(ids(store().queue)).toEqual(['a', 'b', 'c', 'd']);
    expect(store().queue[3].isFavorite).toBe(true);
    expect(store().queueIndex).toBe(0);
  });
});

describe('live streams', () => {
  const radio = track('radio-1', { isLive: true, duration: 0 });

  it('ignores seeking and reports no duration', () => {
    store().playFromList([radio], 0);
    store()._syncPlayback({ isPlaying: true, isBuffering: false, currentTime: 95, duration: NaN });
    store().seek(30);

    expect(store().duration).toBe(0);
    expect(store().currentTime).toBe(0);
    expect(transport.seekTo).not.toHaveBeenCalled();
  });

  it('does not advance when the stream ends', () => {
    store().playFromList([radio, a], 0);
    store()._onTrackEnd();
    expect(store().currentTrack?.id).toBe('radio-1');
  });
});

describe('queue edits', () => {
  it('plays the next track when the playing one is removed', () => {
    store().playFromList([a, b, c], 1);
    store().removeFromQueue(1);
    expect(ids(store().queue)).toEqual(['a', 'c']);
    expect(store().currentTrack?.id).toBe('c');
  });

  it('keeps the playing track selected when the queue is reordered', () => {
    store().playFromList([a, b, c], 0);
    store().reorderQueue(0, 2);
    expect(ids(store().queue)).toEqual(['b', 'c', 'a']);
    expect(store().queue[store().queueIndex].id).toBe('a');
  });

  it('clears what is up next and keeps the playing track', () => {
    store().playFromList([a, b, c], 1);
    store().clearUpNext();
    expect(ids(store().queue)).toEqual(['a', 'b']);
    expect(store().currentTrack?.id).toBe('b');
    expect(transport.stop).not.toHaveBeenCalled();
  });

  it('clamps seeking to the duration', () => {
    store().playFromList([a], 0);
    store().seek(500);
    expect(transport.seekTo).toHaveBeenLastCalledWith(180);
  });

  it('seeks relative to the position, clamped to the start and the duration', () => {
    store().playFromList([a], 0);
    store().seek(5);
    store().seekBy(-10);
    expect(transport.seekTo).toHaveBeenLastCalledWith(0);
    store().seek(175);
    store().seekBy(10);
    expect(transport.seekTo).toHaveBeenLastCalledWith(180);
  });
});

describe('play and shuffle buttons', () => {
  it('records where the queue came from', () => {
    store().playFromList([a, b], 0, 'Late night');
    expect(store().queueSource).toBe('Late night');
  });

  it('shuffles the list and starts from a random track', () => {
    store().playShuffled([a, b, c, d], 'Library', () => 0.6);
    expect(store().isShuffled).toBe(true);
    expect(store().currentTrack?.id).toBe('c');
    expect(ids(store().queue).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(store().queue[0].id).toBe('c');
  });

  it('jumps to a queued track', () => {
    store().playFromList([a, b, c], 0);
    store().playIndex(2);
    expect(store().currentTrack?.id).toBe('c');
    expect(transport.load).toHaveBeenLastCalledWith(c);
  });
});

describe('sleep timer hooks', () => {
  it('scales the output level by the fade', () => {
    store().setVolume(0.8);
    store().setFade(0.5);
    expect(transport.setVolume).toHaveBeenLastCalledWith(0.4);
  });

  it('pauses at the end of the track instead of moving on when asked', () => {
    store().playFromList([a, b], 0);
    store().setStopAfterCurrent(true);
    store()._onTrackEnd();
    expect(store().currentTrack?.id).toBe('a');
    expect(store().isPlaying).toBe(false);
    expect(store().stopAfterCurrent).toBe(false);
    expect(transport.pause).toHaveBeenCalled();
  });
});

describe('output level', () => {
  it('applies the store volume to the engine as soon as it attaches', () => {
    expect(transport.setVolume).toHaveBeenCalledWith(store().volume);
  });

  it('applies the store volume before a loaded track starts playing', () => {
    store().setVolume(0.6);
    transport.setVolume.mockClear();
    store().playFromList([a, b], 0);

    expect(transport.setVolume).toHaveBeenCalledWith(0.6);
    const setAt = transport.setVolume.mock.invocationCallOrder[0];
    expect(setAt).toBeGreaterThan(transport.load.mock.invocationCallOrder[0]);
    expect(setAt).toBeLessThan(transport.play.mock.invocationCallOrder[0]);
  });

  it('fades down from the store volume with no jump', () => {
    store().playFromList([a], 0);
    const engine = () => transport.setVolume.mock.lastCall?.[0] ?? Number.NaN;
    const start = engine();
    expect(start).toBe(store().volume);

    store().setFade(0.99);
    expect(engine()).toBeCloseTo(start * 0.99);
    expect(start - engine()).toBeLessThan(0.01);
  });
});
