import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore, type Track } from './usePlayerStore';

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

function makeTrack(id: string, overrides?: Partial<Track>): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    duration: 200,
    filePath: `/music/${id}.mp3`,
    isFavorite: false,
    ...overrides,
  };
}

const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c'), makeTrack('d')];

function resetStore() {
  usePlayerStore.setState({
    library: [],
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    isShuffled: false,
    repeatMode: 'off',
    isLoading: false,
    error: null,
    crossfadeEnabled: false,
    crossfadeDuration: 5,
    scrubTime: null,
    _seekTarget: null,
  });
}

describe('usePlayerStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.mocked(window.electronAPI.db.tracks.toggleFavorite).mockResolvedValue(undefined);
  });

  // --- setQueue ---
  describe('setQueue', () => {
    it('sets queue and currentTrack from startIndex', () => {
      usePlayerStore.getState().setQueue(tracks, 2);
      const s = usePlayerStore.getState();
      expect(s.queue).toEqual(tracks);
      expect(s.queueIndex).toBe(2);
      expect(s.currentTrack).toEqual(tracks[2]);
      expect(s.isPlaying).toBe(true);
      expect(s.currentTime).toBe(0);
    });

    it('defaults startIndex to 0', () => {
      usePlayerStore.getState().setQueue(tracks);
      expect(usePlayerStore.getState().queueIndex).toBe(0);
      expect(usePlayerStore.getState().currentTrack).toEqual(tracks[0]);
    });

    it('sets currentTrack to null when startIndex is out of range', () => {
      usePlayerStore.getState().setQueue(tracks, 99);
      expect(usePlayerStore.getState().currentTrack).toBeNull();
    });
  });

  // --- next ---
  describe('next', () => {
    it('advances to the next track', () => {
      usePlayerStore.getState().setQueue(tracks, 0);
      usePlayerStore.getState().next();
      const s = usePlayerStore.getState();
      expect(s.queueIndex).toBe(1);
      expect(s.currentTrack).toEqual(tracks[1]);
      expect(s.isPlaying).toBe(true);
    });

    it('wraps to index 0 with repeat-all', () => {
      usePlayerStore.getState().setQueue(tracks, 3);
      usePlayerStore.setState({ repeatMode: 'all' });
      usePlayerStore.getState().next();
      expect(usePlayerStore.getState().queueIndex).toBe(0);
      expect(usePlayerStore.getState().currentTrack).toEqual(tracks[0]);
    });

    it('stops at end without repeat', () => {
      usePlayerStore.getState().setQueue(tracks, 3);
      usePlayerStore.getState().next();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      // queueIndex should stay at 3 (unchanged)
      expect(usePlayerStore.getState().queueIndex).toBe(3);
    });

    it('does nothing on empty queue', () => {
      usePlayerStore.getState().next();
      expect(usePlayerStore.getState().queueIndex).toBe(-1);
    });
  });

  // --- previous ---
  describe('previous', () => {
    it('restarts current track if currentTime > 3', () => {
      usePlayerStore.getState().setQueue(tracks, 2);
      usePlayerStore.setState({ currentTime: 10 });
      usePlayerStore.getState().previous();
      const s = usePlayerStore.getState();
      expect(s.currentTime).toBe(0);
      expect(s.queueIndex).toBe(2);
    });

    it('goes to previous track if currentTime <= 3', () => {
      usePlayerStore.getState().setQueue(tracks, 2);
      usePlayerStore.setState({ currentTime: 1 });
      usePlayerStore.getState().previous();
      const s = usePlayerStore.getState();
      expect(s.queueIndex).toBe(1);
      expect(s.currentTrack).toEqual(tracks[1]);
    });

    it('wraps to last track when at index 0 with currentTime <= 3', () => {
      usePlayerStore.getState().setQueue(tracks, 0);
      usePlayerStore.setState({ currentTime: 0 });
      usePlayerStore.getState().previous();
      expect(usePlayerStore.getState().queueIndex).toBe(3);
      expect(usePlayerStore.getState().currentTrack).toEqual(tracks[3]);
    });
  });

  // --- seek ---
  describe('seek', () => {
    it('sets _seekTarget for valid time', () => {
      usePlayerStore.getState().seek(42);
      expect(usePlayerStore.getState()._seekTarget).toBe(42);
      expect(usePlayerStore.getState().currentTime).toBe(42);
    });

    it('rejects non-finite values', () => {
      usePlayerStore.getState().seek(Infinity);
      expect(usePlayerStore.getState()._seekTarget).toBeNull();

      usePlayerStore.getState().seek(NaN);
      expect(usePlayerStore.getState()._seekTarget).toBeNull();
    });

    it('rejects negative values', () => {
      usePlayerStore.getState().seek(-5);
      expect(usePlayerStore.getState()._seekTarget).toBeNull();
    });

    it('clears scrubTime on seek', () => {
      usePlayerStore.setState({ scrubTime: 10 });
      usePlayerStore.getState().seek(20);
      expect(usePlayerStore.getState().scrubTime).toBeNull();
    });
  });

  // --- removeFromQueue ---
  describe('removeFromQueue', () => {
    it('adjusts index when removing before current', () => {
      usePlayerStore.getState().setQueue(tracks, 2);
      usePlayerStore.getState().removeFromQueue(0);
      expect(usePlayerStore.getState().queueIndex).toBe(1);
      expect(usePlayerStore.getState().currentTrack).toEqual(tracks[2]);
    });

    it('keeps index when removing after current', () => {
      usePlayerStore.getState().setQueue(tracks, 1);
      usePlayerStore.getState().removeFromQueue(3);
      expect(usePlayerStore.getState().queueIndex).toBe(1);
      expect(usePlayerStore.getState().currentTrack).toEqual(tracks[1]);
    });

    it('updates currentTrack when removing the current track', () => {
      usePlayerStore.getState().setQueue(tracks, 1);
      usePlayerStore.getState().removeFromQueue(1);
      // After removing index 1 ('b'), newQueue is [a, c, d], newIndex stays 1 -> currentTrack = 'c'
      expect(usePlayerStore.getState().currentTrack).toEqual(tracks[2]);
    });

    it('handles removing the last track in queue', () => {
      usePlayerStore.getState().setQueue([makeTrack('only')], 0);
      usePlayerStore.getState().removeFromQueue(0);
      expect(usePlayerStore.getState().queue).toHaveLength(0);
      expect(usePlayerStore.getState().currentTrack).toBeNull();
    });
  });

  // --- toggleShuffle ---
  describe('toggleShuffle', () => {
    it('keeps current track at index 0 when shuffling', () => {
      usePlayerStore.getState().setQueue(tracks, 2);
      usePlayerStore.getState().toggleShuffle();
      const s = usePlayerStore.getState();
      expect(s.isShuffled).toBe(true);
      expect(s.queueIndex).toBe(0);
      expect(s.queue[0]).toEqual(tracks[2]);
      expect(s.queue).toHaveLength(tracks.length);
    });

    it('unshuffles without error', () => {
      usePlayerStore.getState().setQueue(tracks, 0);
      usePlayerStore.getState().toggleShuffle();
      usePlayerStore.getState().toggleShuffle();
      expect(usePlayerStore.getState().isShuffled).toBe(false);
    });
  });

  // --- cycleRepeatMode ---
  describe('cycleRepeatMode', () => {
    it('cycles off -> all -> one -> off', () => {
      expect(usePlayerStore.getState().repeatMode).toBe('off');
      usePlayerStore.getState().cycleRepeatMode();
      expect(usePlayerStore.getState().repeatMode).toBe('all');
      usePlayerStore.getState().cycleRepeatMode();
      expect(usePlayerStore.getState().repeatMode).toBe('one');
      usePlayerStore.getState().cycleRepeatMode();
      expect(usePlayerStore.getState().repeatMode).toBe('off');
    });
  });

  // --- toggleFavorite ---
  describe('toggleFavorite', () => {
    it('syncs across library, queue, and currentTrack', () => {
      const t = makeTrack('x', { isFavorite: false });
      usePlayerStore.setState({
        library: [t],
        queue: [t],
        currentTrack: t,
        queueIndex: 0,
      });

      usePlayerStore.getState().toggleFavorite('x');

      const s = usePlayerStore.getState();
      expect(s.library[0].isFavorite).toBe(true);
      expect(s.queue[0].isFavorite).toBe(true);
      expect(s.currentTrack!.isFavorite).toBe(true);
    });

    it('calls electronAPI.db.tracks.toggleFavorite', () => {
      const t = makeTrack('x');
      usePlayerStore.setState({ library: [t], queue: [t], currentTrack: t });
      usePlayerStore.getState().toggleFavorite('x');
      expect(window.electronAPI.db.tracks.toggleFavorite).toHaveBeenCalledWith('x');
    });
  });

  // --- setVolume ---
  describe('setVolume', () => {
    it('clamps to 0-1 range', () => {
      usePlayerStore.getState().setVolume(1.5);
      expect(usePlayerStore.getState().volume).toBe(1);

      usePlayerStore.getState().setVolume(-0.5);
      expect(usePlayerStore.getState().volume).toBe(0);
    });

    it('unmutes on setVolume', () => {
      usePlayerStore.setState({ isMuted: true });
      usePlayerStore.getState().setVolume(0.5);
      expect(usePlayerStore.getState().isMuted).toBe(false);
    });
  });

  // --- setCrossfadeDuration ---
  describe('setCrossfadeDuration', () => {
    it('clamps 1-12 and rounds', () => {
      usePlayerStore.getState().setCrossfadeDuration(0.3);
      expect(usePlayerStore.getState().crossfadeDuration).toBe(1);

      usePlayerStore.getState().setCrossfadeDuration(15);
      expect(usePlayerStore.getState().crossfadeDuration).toBe(12);

      usePlayerStore.getState().setCrossfadeDuration(3.7);
      expect(usePlayerStore.getState().crossfadeDuration).toBe(4);
    });

    it('persists to localStorage', () => {
      usePlayerStore.getState().setCrossfadeDuration(7);
      const raw = localStorage.getItem('shiranami.player-store');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { state: { crossfadeDuration: number } };
      expect(parsed.state.crossfadeDuration).toBe(7);
    });
  });

  // --- playNext ---
  describe('playNext', () => {
    it('inserts track after current index', () => {
      usePlayerStore.getState().setQueue(tracks, 1);
      const extra = makeTrack('extra');
      usePlayerStore.getState().playNext(extra);
      const q = usePlayerStore.getState().queue;
      expect(q[2]).toEqual(extra);
      expect(q).toHaveLength(5);
    });
  });

  // --- _onTrackEnd ---
  describe('_onTrackEnd', () => {
    it('restarts for repeat-one', () => {
      usePlayerStore.getState().setQueue(tracks, 1);
      usePlayerStore.setState({ repeatMode: 'one', currentTime: 100 });
      usePlayerStore.getState()._onTrackEnd();
      expect(usePlayerStore.getState().currentTime).toBe(0);
      expect(usePlayerStore.getState().queueIndex).toBe(1);
    });

    it('calls next otherwise', () => {
      usePlayerStore.getState().setQueue(tracks, 0);
      usePlayerStore.getState()._onTrackEnd();
      expect(usePlayerStore.getState().queueIndex).toBe(1);
    });
  });
});
