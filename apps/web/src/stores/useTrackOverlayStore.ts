import { create } from 'zustand';

/**
 * Volatile per-track fields that mutate independently of the canonical
 * `library: Track[]` array. Stored sparsely — only tracks with at least one
 * pending mutation appear here. Reads merge overlay on top of the seed value
 * from `library` (or any `Track` shape produced upstream).
 */
export interface MutationOverlay {
  isFavorite?: boolean;
  playCount?: number;
  /** ISO timestamp; reserved for the future `lastPlayedAt` migration. */
  lastPlayedAt?: number;
}

interface OverlayState {
  /**
   * Sparse map keyed by `track.id`. Mutated in place to avoid allocating a
   * fresh `Map` on every favorite toggle. Subscribers depend on `version`
   * for re-render signals — never read this map directly inside a memo
   * dependency array.
   */
  overlays: Map<string, MutationOverlay>;
  /**
   * Monotonic counter bumped on every mutation. Lets `useMemo` /
   * `useSyncExternalStore` consumers depend on a primitive instead of the
   * map identity. Same trick `useEqStore` uses for its gains array.
   */
  version: number;
}

interface OverlayActions {
  /**
   * Merge `patch` into the existing overlay entry for `id`. Calling
   * `setOverlay(id, { isFavorite: true })` does NOT clobber a previously-set
   * `playCount` on the same id — partial patches accumulate.
   */
  setOverlay: (id: string, patch: MutationOverlay) => void;
  /** Drop the overlay entry for `id`. No-op if there is no entry. */
  clearOverlay: (id: string) => void;
  /** Drop every overlay entry. Used after `useLibrarySync` re-seeds. */
  clearAll: () => void;
}

export type TrackOverlayStore = OverlayState & OverlayActions;

export const useTrackOverlayStore = create<TrackOverlayStore>()(set => ({
  overlays: new Map(),
  version: 0,

  setOverlay: (id, patch) =>
    set(state => {
      const existing = state.overlays.get(id);
      const next = existing ? { ...existing, ...patch } : { ...patch };
      state.overlays.set(id, next);
      return { version: state.version + 1 };
    }),

  clearOverlay: id =>
    set(state => {
      if (!state.overlays.has(id)) return state;
      state.overlays.delete(id);
      return { version: state.version + 1 };
    }),

  clearAll: () =>
    set(state => {
      if (state.overlays.size === 0) return state;
      state.overlays.clear();
      return { version: state.version + 1 };
    }),
}));

// Preserve store state across Vite HMR (dev only, tree-shaken in production)
if (import.meta.hot) {
  type HmrData = { store?: typeof useTrackOverlayStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useTrackOverlayStore.setState(data.store.getState());
  }
  data.store = useTrackOverlayStore;
  hot.accept();
}
