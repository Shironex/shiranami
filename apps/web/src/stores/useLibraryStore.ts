import { create } from 'zustand';
import { IS_ELECTRON } from '@/lib/platform';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

function fileBasename(filePath: string): string {
  return (
    filePath
      .replace(/[/\\]([^/\\]+)$/, '$1')
      .split(/[/\\]/)
      .pop() ?? filePath
  );
}

interface ScanProgress {
  fileIndex: number;
  fileCount: number;
  currentFile: string;
}

interface LibraryState {
  /** Persistent collection of all tracks known to the app. */
  library: Track[];
  /**
   * True once the initial library query has settled (success, empty, or error).
   * Not persisted — resets to false on every app boot so views can show a
   * skeleton during the cold-start fetch rather than a flash of empty state.
   */
  libraryLoaded: boolean;
  /** Current state of a folder scan operation. */
  scanState: 'idle' | 'scanning' | 'cancelling';
  /** Progress snapshot of the currently active scan, or null when idle. */
  scanProgress: ScanProgress | null;
}

interface LibraryActions {
  setLibrary: (tracks: Track[]) => void;
  addToLibrary: (tracks: Track[]) => void;
  removeFromLibrary: (trackIds: string[]) => void;

  /** Toggle favorite on a track; syncs library, queue, and currentTrack. */
  toggleFavorite: (trackId: string) => void;
  /** Increment play count for a track; syncs library, queue, and currentTrack. */
  incrementTrackPlayCount: (trackId: string) => void;

  setScanState: (state: 'idle' | 'scanning' | 'cancelling') => void;
  updateScanProgress: (data: {
    filePath: string;
    fileIndex: number;
    fileCount: number;
    ok: boolean;
  }) => void;
  resetScanProgress: () => void;
  cancelScan: () => Promise<void>;
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
  const inQueue = playback.queue.some(t => t.id === trackId);
  const isCurrent = playback.currentTrack?.id === trackId;

  if (!inQueue && !isCurrent) return;

  const updates: Partial<{ queue: Track[]; currentTrack: Track | null }> = {};
  if (inQueue) {
    updates.queue = playback.queue.map(t => (t.id === trackId ? mutate(t) : t));
  }
  if (isCurrent && playback.currentTrack) {
    updates.currentTrack = mutate(playback.currentTrack);
  }
  usePlaybackStore.setState(updates);
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  library: [],
  libraryLoaded: false,
  scanState: 'idle',
  scanProgress: null,

  setLibrary: tracks => set({ library: tracks }),

  addToLibrary: tracks => set(s => ({ library: [...s.library, ...tracks] })),

  removeFromLibrary: trackIds => {
    const ids = new Set(trackIds);
    set(s => ({ library: s.library.filter(t => !ids.has(t.id)) }));

    const playback = usePlaybackStore.getState();
    const { queue, queueIndex, currentTrack } = playback;

    const inQueue = queue.some(t => ids.has(t.id));
    const isCurrent = currentTrack != null && ids.has(currentTrack.id);
    if (!inQueue && !isCurrent) return;

    const newQueue = queue.filter(t => !ids.has(t.id));
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

  toggleFavorite: trackId => {
    const overlayStore = useTrackOverlayStore.getState();
    const overlayEntry = overlayStore.overlays.get(trackId);
    const { library } = get();
    const target = library.find(t => t.id === trackId);

    // Resolve the current isFavorite value from overlay-first, then library,
    // then queue (for radio/preview tracks that never enter the library).
    const playback = usePlaybackStore.getState();
    const queueTrack = playback.queue.find(t => t.id === trackId);
    const currentTrack = playback.currentTrack;
    const currentValue =
      overlayEntry?.isFavorite ??
      target?.isFavorite ??
      queueTrack?.isFavorite ??
      (currentTrack?.id === trackId ? currentTrack.isFavorite : undefined) ??
      false;
    const nextFavorite = !currentValue;

    // Library array reference is intentionally NOT touched — the overlay
    // carries the new value until the next full library refetch (rescan /
    // import) reseeds canonical state. Skipping the reallocation here is
    // the entire point of the overlay store: AlbumGrid's groupTracksByAlbum
    // memo no longer invalidates on a favorite toggle.
    overlayStore.setOverlay(trackId, { isFavorite: nextFavorite });
    syncPlaybackTrack(trackId, t => ({ ...t, isFavorite: nextFavorite }));

    if (IS_ELECTRON) {
      window.electronAPI.db.tracks.toggleFavorite(trackId).catch(err => {
        console.warn('[player] Failed to toggle favorite:', err);
        // Revert optimistic update so UI stays in sync with DB.
        useTrackOverlayStore.getState().setOverlay(trackId, { isFavorite: currentValue });
        syncPlaybackTrack(trackId, t => ({ ...t, isFavorite: currentValue }));
      });
    }
  },

  incrementTrackPlayCount: trackId => {
    const { library } = get();
    const increment = (t: Track) => ({ ...t, playCount: (t.playCount ?? 0) + 1 });

    const hasInLibrary = library.some(t => t.id === trackId);
    if (hasInLibrary) {
      set({
        library: library.map(t => (t.id === trackId ? increment(t) : t)),
      });
    }
    syncPlaybackTrack(trackId, increment);

    if (IS_ELECTRON) {
      window.electronAPI.db.tracks.incrementPlayCount(trackId).catch(err => {
        console.warn('[player] Failed to persist play count:', err);
      });
    }
  },

  setScanState: state => set({ scanState: state }),

  updateScanProgress: ({ filePath, fileIndex, fileCount }) => {
    set({
      scanState: 'scanning',
      scanProgress: {
        fileIndex,
        fileCount,
        currentFile: fileBasename(filePath),
      },
    });
  },

  resetScanProgress: () => {
    const wasCancelling = get().scanState === 'cancelling';
    set({ scanState: 'idle', scanProgress: null });
    if (wasCancelling) {
      toast.info(i18n.t('scanCancelled', { ns: 'toast' }));
    }
  },

  cancelScan: async () => {
    if (!IS_ELECTRON || get().scanState !== 'scanning') return;
    set({ scanState: 'cancelling' });
    try {
      await window.electronAPI.library.cancelScan();
    } catch (err) {
      console.warn('Failed to cancel scan', err);
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
