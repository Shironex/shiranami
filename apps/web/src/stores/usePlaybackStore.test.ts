import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from './usePlaybackStore';
import type { Track } from './types';

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
  usePlaybackStore.setState({
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
    _seekTarget: null,
  });
}

describe('usePlaybackStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  // --- setQueue ---
  describe('setQueue', () => {
    it('sets queue and currentTrack from startIndex', () => {
      usePlaybackStore.getState().setQueue(tracks, 2);
      const s = usePlaybackStore.getState();
      expect(s.queue).toEqual(tracks);
      expect(s.queueIndex).toBe(2);
      expect(s.currentTrack).toEqual(tracks[2]);
      expect(s.isPlaying).toBe(true);
      expect(s.currentTime).toBe(0);
    });

    it('defaults startIndex to 0', () => {
      usePlaybackStore.getState().setQueue(tracks);
      expect(usePlaybackStore.getState().queueIndex).toBe(0);
      expect(usePlaybackStore.getState().currentTrack).toEqual(tracks[0]);
    });

    it('sets currentTrack to null when startIndex is out of range', () => {
      usePlaybackStore.getState().setQueue(tracks, 99);
      expect(usePlaybackStore.getState().currentTrack).toBeNull();
    });
  });

  // --- next ---
  describe('next', () => {
    it('advances to the next track', () => {
      usePlaybackStore.getState().setQueue(tracks, 0);
      usePlaybackStore.getState().next();
      const s = usePlaybackStore.getState();
      expect(s.queueIndex).toBe(1);
      expect(s.currentTrack).toEqual(tracks[1]);
      expect(s.isPlaying).toBe(true);
    });

    it('wraps to index 0 with repeat-all', () => {
      usePlaybackStore.getState().setQueue(tracks, 3);
      usePlaybackStore.setState({ repeatMode: 'all' });
      usePlaybackStore.getState().next();
      expect(usePlaybackStore.getState().queueIndex).toBe(0);
      expect(usePlaybackStore.getState().currentTrack).toEqual(tracks[0]);
    });

    it('stops at end without repeat', () => {
      usePlaybackStore.getState().setQueue(tracks, 3);
      usePlaybackStore.getState().next();
      expect(usePlaybackStore.getState().isPlaying).toBe(false);
      // queueIndex should stay at 3 (unchanged)
      expect(usePlaybackStore.getState().queueIndex).toBe(3);
    });

    it('does nothing on empty queue', () => {
      usePlaybackStore.getState().next();
      expect(usePlaybackStore.getState().queueIndex).toBe(-1);
    });
  });

  // --- previous ---
  describe('previous', () => {
    it('restarts current track if currentTime > 3', () => {
      usePlaybackStore.getState().setQueue(tracks, 2);
      usePlaybackStore.setState({ currentTime: 10 });
      usePlaybackStore.getState().previous();
      const s = usePlaybackStore.getState();
      expect(s.currentTime).toBe(0);
      expect(s.queueIndex).toBe(2);
    });

    it('goes to previous track if currentTime <= 3', () => {
      usePlaybackStore.getState().setQueue(tracks, 2);
      usePlaybackStore.setState({ currentTime: 1 });
      usePlaybackStore.getState().previous();
      const s = usePlaybackStore.getState();
      expect(s.queueIndex).toBe(1);
      expect(s.currentTrack).toEqual(tracks[1]);
    });

    it('wraps to last track when at index 0 with currentTime <= 3', () => {
      usePlaybackStore.getState().setQueue(tracks, 0);
      usePlaybackStore.setState({ currentTime: 0 });
      usePlaybackStore.getState().previous();
      expect(usePlaybackStore.getState().queueIndex).toBe(3);
      expect(usePlaybackStore.getState().currentTrack).toEqual(tracks[3]);
    });
  });

  // --- seek ---
  describe('seek', () => {
    it('sets _seekTarget and currentTime for valid time', () => {
      usePlaybackStore.getState().seek(42);
      expect(usePlaybackStore.getState()._seekTarget).toBe(42);
      expect(usePlaybackStore.getState().currentTime).toBe(42);
    });

    it('rejects non-finite values', () => {
      usePlaybackStore.getState().seek(Infinity);
      expect(usePlaybackStore.getState()._seekTarget).toBeNull();

      usePlaybackStore.getState().seek(NaN);
      expect(usePlaybackStore.getState()._seekTarget).toBeNull();
    });

    it('rejects negative values', () => {
      usePlaybackStore.getState().seek(-5);
      expect(usePlaybackStore.getState()._seekTarget).toBeNull();
    });
  });

  // --- removeFromQueue ---
  describe('removeFromQueue', () => {
    it('adjusts index when removing before current', () => {
      usePlaybackStore.getState().setQueue(tracks, 2);
      usePlaybackStore.getState().removeFromQueue(0);
      expect(usePlaybackStore.getState().queueIndex).toBe(1);
      expect(usePlaybackStore.getState().currentTrack).toEqual(tracks[2]);
    });

    it('keeps index when removing after current', () => {
      usePlaybackStore.getState().setQueue(tracks, 1);
      usePlaybackStore.getState().removeFromQueue(3);
      expect(usePlaybackStore.getState().queueIndex).toBe(1);
      expect(usePlaybackStore.getState().currentTrack).toEqual(tracks[1]);
    });

    it('updates currentTrack when removing the current track', () => {
      usePlaybackStore.getState().setQueue(tracks, 1);
      usePlaybackStore.getState().removeFromQueue(1);
      // After removing index 1 ('b'), newQueue is [a, c, d], newIndex stays 1 -> currentTrack = 'c'
      expect(usePlaybackStore.getState().currentTrack).toEqual(tracks[2]);
    });

    it('handles removing the last track in queue', () => {
      usePlaybackStore.getState().setQueue([makeTrack('only')], 0);
      usePlaybackStore.getState().removeFromQueue(0);
      expect(usePlaybackStore.getState().queue).toHaveLength(0);
      expect(usePlaybackStore.getState().currentTrack).toBeNull();
    });
  });

  // --- toggleShuffle ---
  describe('toggleShuffle', () => {
    it('keeps current track at index 0 when shuffling', () => {
      usePlaybackStore.getState().setQueue(tracks, 2);
      usePlaybackStore.getState().toggleShuffle();
      const s = usePlaybackStore.getState();
      expect(s.isShuffled).toBe(true);
      expect(s.queueIndex).toBe(0);
      expect(s.queue[0]).toEqual(tracks[2]);
      expect(s.queue).toHaveLength(tracks.length);
    });

    it('unshuffles without error', () => {
      usePlaybackStore.getState().setQueue(tracks, 0);
      usePlaybackStore.getState().toggleShuffle();
      usePlaybackStore.getState().toggleShuffle();
      expect(usePlaybackStore.getState().isShuffled).toBe(false);
    });
  });

  // --- cycleRepeatMode ---
  describe('cycleRepeatMode', () => {
    it('cycles off -> all -> one -> off', () => {
      expect(usePlaybackStore.getState().repeatMode).toBe('off');
      usePlaybackStore.getState().cycleRepeatMode();
      expect(usePlaybackStore.getState().repeatMode).toBe('all');
      usePlaybackStore.getState().cycleRepeatMode();
      expect(usePlaybackStore.getState().repeatMode).toBe('one');
      usePlaybackStore.getState().cycleRepeatMode();
      expect(usePlaybackStore.getState().repeatMode).toBe('off');
    });
  });

  // --- setVolume ---
  describe('setVolume', () => {
    it('clamps to 0-1 range', () => {
      usePlaybackStore.getState().setVolume(1.5);
      expect(usePlaybackStore.getState().volume).toBe(1);

      usePlaybackStore.getState().setVolume(-0.5);
      expect(usePlaybackStore.getState().volume).toBe(0);
    });

    it('unmutes on setVolume', () => {
      usePlaybackStore.setState({ isMuted: true });
      usePlaybackStore.getState().setVolume(0.5);
      expect(usePlaybackStore.getState().isMuted).toBe(false);
    });
  });

  // --- setCrossfadeDuration ---
  describe('setCrossfadeDuration', () => {
    it('clamps 1-12 and rounds', () => {
      usePlaybackStore.getState().setCrossfadeDuration(0.3);
      expect(usePlaybackStore.getState().crossfadeDuration).toBe(1);

      usePlaybackStore.getState().setCrossfadeDuration(15);
      expect(usePlaybackStore.getState().crossfadeDuration).toBe(12);

      usePlaybackStore.getState().setCrossfadeDuration(3.7);
      expect(usePlaybackStore.getState().crossfadeDuration).toBe(4);
    });

    it('persists to localStorage under the legacy key', () => {
      // The persist key is deliberately kept as `shiranami.player-store` so
      // existing users don't lose their crossfade preferences when the monolith
      // was split into focused stores.
      usePlaybackStore.getState().setCrossfadeDuration(7);
      const raw = localStorage.getItem('shiranami.player-store');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { state: { crossfadeDuration: number } };
      expect(parsed.state.crossfadeDuration).toBe(7);
    });
  });

  // --- playNext ---
  describe('playNext', () => {
    it('inserts track after current index', () => {
      usePlaybackStore.getState().setQueue(tracks, 1);
      const extra = makeTrack('extra');
      usePlaybackStore.getState().playNext(extra);
      const q = usePlaybackStore.getState().queue;
      expect(q[2]).toEqual(extra);
      expect(q).toHaveLength(5);
    });
  });

  // --- _onTrackEnd ---
  describe('_onTrackEnd', () => {
    it('restarts for repeat-one', () => {
      usePlaybackStore.getState().setQueue(tracks, 1);
      usePlaybackStore.setState({ repeatMode: 'one', currentTime: 100 });
      usePlaybackStore.getState()._onTrackEnd();
      expect(usePlaybackStore.getState().currentTime).toBe(0);
      expect(usePlaybackStore.getState().queueIndex).toBe(1);
    });

    it('calls next otherwise', () => {
      usePlaybackStore.getState().setQueue(tracks, 0);
      usePlaybackStore.getState()._onTrackEnd();
      expect(usePlaybackStore.getState().queueIndex).toBe(1);
    });
  });
});
