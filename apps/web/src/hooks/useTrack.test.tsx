import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import { useTrack } from './useTrack';
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

describe('useTrack', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], libraryLoaded: false });
    useTrackOverlayStore.setState({
      overlays: new Map(),
      version: 0,
    });
  });

  it('returns null when id is undefined', () => {
    const { result } = renderHook(() => useTrack(undefined));
    expect(result.current).toBeNull();
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useTrack(null));
    expect(result.current).toBeNull();
  });

  it('returns null when no library entry and no fallback', () => {
    const { result } = renderHook(() => useTrack('missing'));
    expect(result.current).toBeNull();
  });

  it('returns the library entry unchanged when overlay is empty', () => {
    const t = makeTrack('a', { isFavorite: false, playCount: 2 });
    useLibraryStore.setState({ library: [t] });

    const { result } = renderHook(() => useTrack('a'));
    expect(result.current).toEqual(t);
  });

  it('merges overlay fields on top of the library entry', () => {
    const t = makeTrack('a', { isFavorite: false, playCount: 2 });
    useLibraryStore.setState({ library: [t] });
    useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });

    const { result } = renderHook(() => useTrack('a'));
    expect(result.current?.isFavorite).toBe(true);
    expect(result.current?.playCount).toBe(2);
    expect(result.current?.title).toBe('Track a');
  });

  it('falls back to the provided fallback Track when library has no match', () => {
    const radio = makeTrack('radio', { isFavorite: false });
    const { result } = renderHook(() => useTrack('radio', radio));
    expect(result.current).toEqual(radio);
  });

  it('merges overlay on top of the fallback Track too', () => {
    const radio = makeTrack('radio', { isFavorite: false });
    useTrackOverlayStore.getState().setOverlay('radio', { isFavorite: true });

    const { result } = renderHook(() => useTrack('radio', radio));
    expect(result.current?.isFavorite).toBe(true);
  });

  it('reflects subsequent overlay mutations after re-render', () => {
    const t = makeTrack('a', { isFavorite: false });
    useLibraryStore.setState({ library: [t] });

    const { result, rerender } = renderHook(() => useTrack('a'));
    expect(result.current?.isFavorite).toBe(false);

    useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });
    rerender();

    expect(result.current?.isFavorite).toBe(true);
  });
});
