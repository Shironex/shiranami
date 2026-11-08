import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import { loadLibrary } from '@/lib/library';
import { deleteOwnedFiles, deleteTracksFromDb } from '@/lib/removal';
import { appFileDeleter } from '@/lib/track-files';
import { usePlayerStore, type RemovedQueueEntry, type Track } from '@/stores/usePlayerStore';
import { usePlaylistStore } from '@/stores/usePlaylistStore';

/** How long "Removed · Undo" stays before the removal becomes final. */
export const UNDO_WINDOW_MS = 5000;

interface PendingRemoval {
  tracks: Track[];
  queueEntries: RemovedQueueEntry[];
  db: SQLiteDatabase;
}

interface RemovalState {
  pending: PendingRemoval | null;
}

interface RemovalActions {
  /**
   * Takes songs out of the library, playlists and queue right away, but leaves
   * SQLite and the files alone until the undo window ends. The window is the
   * soft delete: nothing is written, so an undo cannot lose anything.
   */
  remove: (db: SQLiteDatabase, tracks: Track[]) => void;
  undo: () => Promise<void>;
  /** Makes the pending removal final: rows first, then the app's own files. */
  commit: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Reads the library and playlists back from SQLite, which is the truth. */
async function reloadFromDb(db: SQLiteDatabase) {
  usePlaylistStore.getState().setHidden([]);
  usePlayerStore.getState().setLibrary(await loadLibrary(db));
  await usePlaylistStore.getState().load(db);
}

export const useRemovalStore = create<RemovalState & RemovalActions>((set, get) => ({
  pending: null,

  remove: (db, tracks) => {
    if (tracks.length === 0) return;
    // One undo at a time: a second removal finalises the first.
    void get().commit();

    const ids = tracks.map(t => t.id);
    const queueEntries = usePlayerStore.getState().removeTracks(ids);
    usePlaylistStore.getState().setHidden(ids);
    set({ pending: { tracks, queueEntries, db } });

    timer = setTimeout(() => void get().commit(), UNDO_WINDOW_MS);
  },

  undo: async () => {
    const pending = get().pending;
    if (!pending) return;
    clearTimer();
    set({ pending: null });
    await reloadFromDb(pending.db);
    usePlayerStore.getState().restoreQueueEntries(pending.queueEntries);
  },

  commit: async () => {
    const pending = get().pending;
    if (!pending) return;
    clearTimer();
    set({ pending: null });
    try {
      await deleteTracksFromDb(
        pending.db,
        pending.tracks.map(t => t.id)
      );
    } catch {
      // Nothing was deleted, so show the songs again instead of hiding them for good.
      await reloadFromDb(pending.db);
      return;
    }
    usePlaylistStore.getState().setHidden([]);
    deleteOwnedFiles(
      pending.tracks.map(t => t.filePath),
      appFileDeleter()
    );
  },
}));
