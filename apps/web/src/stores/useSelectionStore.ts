import { create } from 'zustand';
import { useViewStore } from '@/stores/useViewStore';

interface Identifiable {
  id: string;
}

interface SelectionState {
  selectedTrackIds: Set<string>;
  lastClickedIndex: number | null;
}

interface SelectionActions {
  toggleTrack: (trackId: string, index: number) => void;
  selectRange: (toIndex: number, trackList: Identifiable[]) => void;
  selectSingle: (trackId: string, index: number) => void;
  selectAll: (trackList: Identifiable[]) => void;
  clearSelection: () => void;
}

export type SelectionStore = SelectionState & SelectionActions;

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedTrackIds: new Set(),
  lastClickedIndex: null,

  toggleTrack: (trackId, index) => {
    const { selectedTrackIds } = get();
    const next = new Set(selectedTrackIds);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    set({ selectedTrackIds: next, lastClickedIndex: index });
  },

  selectRange: (toIndex, trackList) => {
    const { lastClickedIndex, selectedTrackIds } = get();
    const fromIndex = lastClickedIndex ?? 0;
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const next = new Set(selectedTrackIds);
    for (let i = start; i <= end; i++) {
      const track = trackList[i];
      if (track) next.add(track.id);
    }
    set({ selectedTrackIds: next });
  },

  selectSingle: (trackId, index) => {
    set({ selectedTrackIds: new Set([trackId]), lastClickedIndex: index });
  },

  selectAll: trackList => {
    set({
      selectedTrackIds: new Set(trackList.map(t => t.id)),
      lastClickedIndex: null,
    });
  },

  clearSelection: () => {
    set({ selectedTrackIds: new Set(), lastClickedIndex: null });
  },
}));

// Clear selection when navigating to a different view
let prevView = useViewStore.getState().activeView;
void useViewStore.subscribe(state => {
  if (state.activeView !== prevView) {
    prevView = state.activeView;
    useSelectionStore.getState().clearSelection();
  }
});
