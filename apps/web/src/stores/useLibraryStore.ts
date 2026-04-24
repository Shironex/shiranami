import { create } from 'zustand';
import { IS_ELECTRON } from '@/lib/platform';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

interface LibraryState {
  /** Persistent collection of all tracks known to the app. */
  library: Track[];
  /**
   * True once the initial library query has settled (success, empty, or error).
   * Not persisted — resets to false on every app boot so views can show a
   * skeleton during the cold-start fetch rather than a flash of empty state.
   */
  libraryLoaded: boolean;
}

interface LibraryActions {
  setLibrary: (tracks: Track[]) => void;
  addToLibrary: (tracks: Track[]) => void;
  removeFromLibrary: (trackIds: string[]) => void;

  /** Toggle favorite on a track; syncs library, queue, and currentTrack. */
  toggleFavorite: (trackId: string) => void;
  /** Increment play count for a track; syncs library, queue, and currentTrack. */
  incrementTrackPlayCount: (trackId: string) => void;
}

export type LibraryStore = LibraryState & LibraryActions;

/**
 * Apply a per-track mutation across the playback store's queue + currentTrack,
 * only touching them if the track actually lives there. Kept here because the
 * cross-store sync is library-owned (favorite/play-count changes originate in
 * the library and need to ripple into any active playback references).
 */
function syncPlaybackTrack(trackId: string, mutate: (track: Track) => Track) {
  const playback = usePlaybackStore.getState();
  const inQueue = playback.queue.some((t) => t.id === trackId);
  const isCurrent = playback.currentTrack?.id === trackId;

  if (!inQueue && !isCurrent) return;

  const updates: Partial<{ queue: Track[]; currentTrack: Track | null }> = {};
  if (inQueue) {
    updates.queue = playback.queue.map((t) => (t.id === trackId ? mutate(t) : t));
  }
  if (isCurrent && playback.currentTrack) {
    updates.currentTrack = mutate(playback.currentTrack);
  }
  usePlaybackStore.setState(updates);
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  library: [],
  libraryLoaded: false,

  setLibrary: (tracks) => set({ library: tracks }),

  addToLibrary: (tracks) =>
    set((s) => ({ library: [...s.library, ...tracks] })),

  removeFromLibrary: (trackIds) => {
    const ids = new Set(trackIds);
    set((s) => ({ library: s.library.filter((t) => !ids.has(t.id)) }));

    const playback = usePlaybackStore.getState();
    const { queue, queueIndex, currentTrack } = playback;

    const inQueue = queue.some((t) => ids.has(t.id));
    const isCurrent = currentTrack != null && ids.has(currentTrack.id);
    if (!inQueue && !isCurrent) return;

    const newQueue = queue.filter((t) => !ids.has(t.id));
    let newIndex = queueIndex;
    for (let i = 0; i < queueIndex && i < queue.length; i++) {
      if (ids.has(queue[i].id)) newIndex--;
    }
    const targetIndex = newQueue.length > 0 ? Math.min(newIndex, newQueue.length - 1) : -1;

    if (isCurrent) {
      const nextTrack = targetIndex !== -1 ? newQueue[targetIndex] : null;
      usePlaybackStore.setState({
        queue: newQueue,
        queueIndex: targetIndex,
        currentTrack: nextTrack,
        currentTime: 0,
        isPlaying: !!nextTrack,
      });
    } else {
      usePlaybackStore.setState({
        queue: newQueue,
        queueIndex: targetIndex,
      });
    }
  },

  toggleFavorite: (trackId) => {
    const { library } = get();
    const target = library.find((t) => t.id === trackId);
    if (!target) {
      // Track isn't in the library — still sync playback references if any,
      // since radio/preview tracks can flow through the queue without being
      // in the library yet.
      syncPlaybackTrack(trackId, (t) => ({ ...t, isFavorite: !t.isFavorite }));
    } else {
      const nextFavorite = !target.isFavorite;
      set({
        library: library.map((t) =>
          t.id === trackId ? { ...t, isFavorite: nextFavorite } : t,
        ),
      });
      syncPlaybackTrack(trackId, (t) => ({ ...t, isFavorite: nextFavorite }));
    }

    if (IS_ELECTRON) {
      window.electronAPI.db.tracks.toggleFavorite(trackId).catch((err) => {
        console.warn('[player] Failed to toggle favorite:', err);
        // Revert optimistic update so UI stays in sync with DB.
        const revert = (t: Track) =>
          t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t;
        set((s) => ({ library: s.library.map(revert) }));
        syncPlaybackTrack(trackId, (t) => ({ ...t, isFavorite: !t.isFavorite }));
      });
    }
  },

  incrementTrackPlayCount: (trackId) => {
    const { library } = get();
    const increment = (t: Track) => ({ ...t, playCount: (t.playCount ?? 0) + 1 });

    const hasInLibrary = library.some((t) => t.id === trackId);
    if (hasInLibrary) {
      set({
        library: library.map((t) => (t.id === trackId ? increment(t) : t)),
      });
    }
    syncPlaybackTrack(trackId, increment);

    if (IS_ELECTRON) {
      window.electronAPI.db.tracks.incrementPlayCount(trackId).catch((err) => {
        console.warn('[player] Failed to persist play count:', err);
      });
    }
  },
}));

// Preserve store state across Vite HMR (dev only, tree-shaken in production)
if (import.meta.hot) {
  type HmrData = { store?: typeof useLibraryStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useLibraryStore.setState({
      ...data.store.getState(),
      libraryLoaded: false,
    });
  }
  data.store = useLibraryStore;
  hot.accept();
}
