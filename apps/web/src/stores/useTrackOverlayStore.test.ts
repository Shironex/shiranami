import { beforeEach, describe, expect, it } from 'vitest';
import { useTrackOverlayStore } from './useTrackOverlayStore';

describe('useTrackOverlayStore', () => {
  beforeEach(() => {
    useTrackOverlayStore.setState({
      overlays: new Map(),
      version: 0,
    });
  });

  describe('setOverlay', () => {
    it('creates a new entry for an unknown id', () => {
      useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });
      expect(useTrackOverlayStore.getState().overlays.get('a')).toEqual({
        isFavorite: true,
      });
    });

    it('merges patches into an existing entry', () => {
      const { setOverlay } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      setOverlay('a', { playCount: 5 });
      expect(useTrackOverlayStore.getState().overlays.get('a')).toEqual({
        isFavorite: true,
        playCount: 5,
      });
    });

    it('overwrites only the patched field, leaving others intact', () => {
      const { setOverlay } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true, playCount: 1 });
      setOverlay('a', { isFavorite: false });
      expect(useTrackOverlayStore.getState().overlays.get('a')).toEqual({
        isFavorite: false,
        playCount: 1,
      });
    });

    it('bumps version on every call', () => {
      const start = useTrackOverlayStore.getState().version;
      useTrackOverlayStore.getState().setOverlay('a', { isFavorite: true });
      const afterFirst = useTrackOverlayStore.getState().version;
      useTrackOverlayStore.getState().setOverlay('a', { playCount: 1 });
      const afterSecond = useTrackOverlayStore.getState().version;
      expect(afterFirst).toBe(start + 1);
      expect(afterSecond).toBe(afterFirst + 1);
    });

    it('does not collide entries between distinct ids', () => {
      const { setOverlay } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      setOverlay('b', { isFavorite: false, playCount: 9 });
      const overlays = useTrackOverlayStore.getState().overlays;
      expect(overlays.get('a')).toEqual({ isFavorite: true });
      expect(overlays.get('b')).toEqual({ isFavorite: false, playCount: 9 });
    });
  });

  describe('clearOverlay', () => {
    it('removes an existing entry', () => {
      const { setOverlay, clearOverlay } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      clearOverlay('a');
      expect(useTrackOverlayStore.getState().overlays.has('a')).toBe(false);
    });

    it('bumps version when an entry is removed', () => {
      const { setOverlay, clearOverlay } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      const before = useTrackOverlayStore.getState().version;
      clearOverlay('a');
      expect(useTrackOverlayStore.getState().version).toBe(before + 1);
    });

    it('is a no-op (no version bump) for an unknown id', () => {
      const before = useTrackOverlayStore.getState().version;
      useTrackOverlayStore.getState().clearOverlay('missing');
      expect(useTrackOverlayStore.getState().version).toBe(before);
    });

    it('does not affect other entries', () => {
      const { setOverlay, clearOverlay } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      setOverlay('b', { isFavorite: false });
      clearOverlay('a');
      expect(useTrackOverlayStore.getState().overlays.get('b')).toEqual({
        isFavorite: false,
      });
    });
  });

  describe('clearAll', () => {
    it('empties the overlay map', () => {
      const { setOverlay, clearAll } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      setOverlay('b', { playCount: 3 });
      clearAll();
      expect(useTrackOverlayStore.getState().overlays.size).toBe(0);
    });

    it('bumps version when entries are cleared', () => {
      const { setOverlay, clearAll } = useTrackOverlayStore.getState();
      setOverlay('a', { isFavorite: true });
      const before = useTrackOverlayStore.getState().version;
      clearAll();
      expect(useTrackOverlayStore.getState().version).toBe(before + 1);
    });

    it('is a no-op (no version bump) when already empty', () => {
      const before = useTrackOverlayStore.getState().version;
      useTrackOverlayStore.getState().clearAll();
      expect(useTrackOverlayStore.getState().version).toBe(before);
    });
  });
});
