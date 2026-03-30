import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './useSelectionStore';

const trackList = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' },
];

function resetStore() {
  useSelectionStore.setState({
    selectedTrackIds: new Set(),
    lastClickedIndex: null,
  });
}

describe('useSelectionStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // --- toggleTrack ---
  describe('toggleTrack', () => {
    it('adds a track to selection', () => {
      useSelectionStore.getState().toggleTrack('a', 0);
      expect(useSelectionStore.getState().selectedTrackIds.has('a')).toBe(true);
      expect(useSelectionStore.getState().lastClickedIndex).toBe(0);
    });

    it('removes an already-selected track', () => {
      useSelectionStore.setState({ selectedTrackIds: new Set(['a']), lastClickedIndex: 0 });
      useSelectionStore.getState().toggleTrack('a', 0);
      expect(useSelectionStore.getState().selectedTrackIds.has('a')).toBe(false);
    });

    it('updates lastClickedIndex', () => {
      useSelectionStore.getState().toggleTrack('c', 2);
      expect(useSelectionStore.getState().lastClickedIndex).toBe(2);
    });
  });

  // --- selectRange ---
  describe('selectRange', () => {
    it('selects a forward range from lastClickedIndex', () => {
      useSelectionStore.setState({ lastClickedIndex: 1 });
      useSelectionStore.getState().selectRange(3, trackList);
      const ids = useSelectionStore.getState().selectedTrackIds;
      expect(ids).toEqual(new Set(['b', 'c', 'd']));
    });

    it('selects a backward range', () => {
      useSelectionStore.setState({ lastClickedIndex: 3 });
      useSelectionStore.getState().selectRange(1, trackList);
      const ids = useSelectionStore.getState().selectedTrackIds;
      expect(ids).toEqual(new Set(['b', 'c', 'd']));
    });

    it('unions with existing selection', () => {
      useSelectionStore.setState({
        selectedTrackIds: new Set(['a']),
        lastClickedIndex: 2,
      });
      useSelectionStore.getState().selectRange(4, trackList);
      const ids = useSelectionStore.getState().selectedTrackIds;
      expect(ids).toEqual(new Set(['a', 'c', 'd', 'e']));
    });

    it('defaults fromIndex to 0 when lastClickedIndex is null', () => {
      useSelectionStore.getState().selectRange(2, trackList);
      const ids = useSelectionStore.getState().selectedTrackIds;
      expect(ids).toEqual(new Set(['a', 'b', 'c']));
    });
  });

  // --- selectAll ---
  describe('selectAll', () => {
    it('selects all provided IDs', () => {
      useSelectionStore.getState().selectAll(trackList);
      expect(useSelectionStore.getState().selectedTrackIds).toEqual(
        new Set(['a', 'b', 'c', 'd', 'e']),
      );
    });

    it('sets lastClickedIndex to null', () => {
      useSelectionStore.setState({ lastClickedIndex: 2 });
      useSelectionStore.getState().selectAll(trackList);
      expect(useSelectionStore.getState().lastClickedIndex).toBeNull();
    });
  });

  // --- clearSelection ---
  describe('clearSelection', () => {
    it('resets selectedTrackIds and lastClickedIndex', () => {
      useSelectionStore.setState({
        selectedTrackIds: new Set(['a', 'b']),
        lastClickedIndex: 1,
      });
      useSelectionStore.getState().clearSelection();
      expect(useSelectionStore.getState().selectedTrackIds.size).toBe(0);
      expect(useSelectionStore.getState().lastClickedIndex).toBeNull();
    });
  });
});
