import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from './useLibraryStore';
import { usePlaybackStore } from './usePlaybackStore';
import type { Track } from './types';

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

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], libraryLoaded: false });
    usePlaybackStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
    });
    vi.mocked(window.electronAPI.db.tracks.toggleFavorite).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.db.tracks.incrementPlayCount).mockResolvedValue(undefined);
  });

  // --- setLibrary / addToLibrary / removeFromLibrary ---

  describe('setLibrary', () => {
    it('replaces the library array', () => {
      useLibraryStore.getState().setLibrary([makeTrack('a'), makeTrack('b')]);
      expect(useLibraryStore.getState().library).toHaveLength(2);
    });
  });

  describe('addToLibrary', () => {
    it('appends to the existing library', () => {
      useLibraryStore.setState({ library: [makeTrack('a')] });
      useLibraryStore.getState().addToLibrary([makeTrack('b'), makeTrack('c')]);
      expect(useLibraryStore.getState().library.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('removeFromLibrary', () => {
    it('filters out matching ids', () => {
      useLibraryStore.setState({
        library: [makeTrack('a'), makeTrack('b'), makeTrack('c')],
      });
      useLibraryStore.getState().removeFromLibrary(['b']);
      expect(useLibraryStore.getState().library.map((t) => t.id)).toEqual(['a', 'c']);
    });
  });

  // --- toggleFavorite (cross-store sync) ---

  describe('toggleFavorite', () => {
    it('syncs across library, queue, and currentTrack', () => {
      const t = makeTrack('x', { isFavorite: false });
      useLibraryStore.setState({ library: [t] });
      usePlaybackStore.setState({
        queue: [t],
        currentTrack: t,
        queueIndex: 0,
      });

      useLibraryStore.getState().toggleFavorite('x');

      expect(useLibraryStore.getState().library[0].isFavorite).toBe(true);
      expect(usePlaybackStore.getState().queue[0].isFavorite).toBe(true);
      expect(usePlaybackStore.getState().currentTrack!.isFavorite).toBe(true);
    });

    it('calls electronAPI.db.tracks.toggleFavorite', () => {
      const t = makeTrack('x');
      useLibraryStore.setState({ library: [t] });
      usePlaybackStore.setState({ queue: [t], currentTrack: t });
      useLibraryStore.getState().toggleFavorite('x');
      expect(window.electronAPI.db.tracks.toggleFavorite).toHaveBeenCalledWith('x');
    });

    it('does not touch the playback store when the track is not queued', () => {
      const t = makeTrack('only-in-library', { isFavorite: false });
      useLibraryStore.setState({ library: [t] });
      usePlaybackStore.setState({ queue: [], currentTrack: null });

      useLibraryStore.getState().toggleFavorite('only-in-library');

      expect(useLibraryStore.getState().library[0].isFavorite).toBe(true);
      expect(usePlaybackStore.getState().queue).toHaveLength(0);
      expect(usePlaybackStore.getState().currentTrack).toBeNull();
    });

    it('syncs playback even when the track is not in the library (radio/preview case)', () => {
      // Radio tracks flow through the queue without being in the library.
      const radioTrack = makeTrack('radio', { isFavorite: false });
      useLibraryStore.setState({ library: [] });
      usePlaybackStore.setState({
        queue: [radioTrack],
        currentTrack: radioTrack,
        queueIndex: 0,
      });

      useLibraryStore.getState().toggleFavorite('radio');

      expect(usePlaybackStore.getState().queue[0].isFavorite).toBe(true);
      expect(usePlaybackStore.getState().currentTrack!.isFavorite).toBe(true);
    });
  });

  // --- incrementTrackPlayCount ---

  describe('incrementTrackPlayCount', () => {
    it('increments across library, queue, and currentTrack', () => {
      const t = makeTrack('x', { playCount: 2 });
      useLibraryStore.setState({ library: [t] });
      usePlaybackStore.setState({
        queue: [t],
        currentTrack: t,
        queueIndex: 0,
      });

      useLibraryStore.getState().incrementTrackPlayCount('x');

      expect(useLibraryStore.getState().library[0].playCount).toBe(3);
      expect(usePlaybackStore.getState().queue[0].playCount).toBe(3);
      expect(usePlaybackStore.getState().currentTrack!.playCount).toBe(3);
    });

    it('defaults from undefined playCount to 1', () => {
      const t = makeTrack('x');
      useLibraryStore.setState({ library: [t] });
      useLibraryStore.getState().incrementTrackPlayCount('x');
      expect(useLibraryStore.getState().library[0].playCount).toBe(1);
    });

    it('persists to the DB via electronAPI', () => {
      useLibraryStore.setState({ library: [makeTrack('x')] });
      useLibraryStore.getState().incrementTrackPlayCount('x');
      expect(window.electronAPI.db.tracks.incrementPlayCount).toHaveBeenCalledWith('x');
    });
  });
});
