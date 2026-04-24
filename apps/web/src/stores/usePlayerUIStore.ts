import { create } from 'zustand';

interface PlayerUIState {
  /**
   * Scrubber position (seconds) while the user is dragging the seek bar.
   * Non-null only during an active pointer drag; reset to null on pointer
   * release (when SeekBar commits the value via `playbackStore.seek`).
   */
  scrubTime: number | null;
}

interface PlayerUIActions {
  setScrubTime: (time: number | null) => void;
}

export type PlayerUIStore = PlayerUIState & PlayerUIActions;

export const usePlayerUIStore = create<PlayerUIStore>()((set) => ({
  scrubTime: null,
  setScrubTime: (time) => set({ scrubTime: time }),
}));

// Preserve store state across Vite HMR (dev only, tree-shaken in production)
if (import.meta.hot) {
  type HmrData = { store?: typeof usePlayerUIStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    usePlayerUIStore.setState({
      ...data.store.getState(),
      scrubTime: null,
    });
  }
  data.store = usePlayerUIStore;
  hot.accept();
}
