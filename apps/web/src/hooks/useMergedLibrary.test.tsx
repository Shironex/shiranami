import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import { useMergedLibrary } from './useMergedLibrary';
import type { Track } from '@/stores/types';

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    duration: 200,
    filePath: `/music/${id}.mp3`,
    isFavorite: false,
    playCount: 0,
    ...overrides,
  };
}

describe('useMergedLibrary', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], libraryLoaded: false });
    useTrackOverlayStore.setState({
      overlays: new Map(),
      version: 0,
    });
  });

  it('returns the canonical library reference unchanged when overlay is empty', () => {
    const library = [makeTrack('a'), makeTrack('b')];
    useLibraryStore.setState({ library });

    const { result } = renderHook(() => useMergedLibrary());
    expect(result.current).toBe(library);
  });

  it('returns a new array with overlays merged when overlay has entries', () => {
    const library = [makeTrack('a', { isFavorite: false }), makeTrack('b', { isFavorite: false })];
    useLibraryStore.setState({ library });
    useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });

    const { result } = renderHook(() => useMergedLibrary());
    expect(result.current).not.toBe(library);
    expect(result.current[0].isFavorite).toBe(true);
    expect(result.current[1].isFavorite).toBe(false);
  });

  it('keeps reference equality for tracks without overlay entries', () => {
    const library = [makeTrack('a', { isFavorite: false }), makeTrack('b', { isFavorite: false })];
    useLibraryStore.setState({ library });
    useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });

    const { result } = renderHook(() => useMergedLibrary());
    expect(result.current[1]).toBe(library[1]);
  });

  it('preserves array length and order', () => {
    const library = ['a', 'b', 'c'].map(id => makeTrack(id));
    useLibraryStore.setState({ library });
    useTrackOverlayStore.getState().setOverlay('b', { playCount: 7 });

    const { result } = renderHook(() => useMergedLibrary());
    expect(result.current.map(t => t.id)).toEqual(['a', 'b', 'c']);
    expect(result.current[1].playCount).toBe(7);
  });

  it('returns a stable reference across re-renders when neither library nor overlay version changes', () => {
    const library = [makeTrack('a')];
    useLibraryStore.setState({ library });

    const { result, rerender } = renderHook(() => useMergedLibrary());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('produces a fresh result after a new overlay mutation', () => {
    const library = [makeTrack('a', { isFavorite: false })];
    useLibraryStore.setState({ library });

    const { result, rerender } = renderHook(() => useMergedLibrary());
    expect(result.current[0].isFavorite).toBe(false);

    useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });
    rerender();

    expect(result.current[0].isFavorite).toBe(true);
  });
});
