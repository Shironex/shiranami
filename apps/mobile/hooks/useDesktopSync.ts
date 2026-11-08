import { useCallback, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import { withLibraryLock } from '@/lib/library-scan';
import { SyncClient, asSyncError, findHost } from '@/lib/sync-client';
import { audioFileName, partialFile, saveArt, secureSecrets, syncFetch } from '@/lib/sync-files';
import { forgetPeer, loadPeer, savePeerDetails } from '@/lib/sync-peer';
import { runSync } from '@/lib/sync-run';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { usePlaylistStore } from '@/stores/usePlaylistStore';
import { useSyncStore } from '@/stores/useSyncStore';

/** Songs between library reloads while a pull runs, so new ones show up as it goes. */
const RELOAD_EVERY = 10;

let current: AbortController | null = null;
let loading: Promise<void> | null = null;

/**
 * The paired desktop: reads it once, runs Sync now (one at a time, app wide,
 * so leaving the screen does not stop it), cancels, and forgets.
 */
export function useDesktopSync() {
  const db = useSQLiteContext();
  const setLibrary = usePlayerStore(s => s.setLibrary);
  const loaded = useSyncStore(s => s.loaded);
  const peer = useSyncStore(s => s.peer);
  const running = useSyncStore(s => s.running);
  const progress = useSyncStore(s => s.progress);
  const error = useSyncStore(s => s.error);
  const last = useSyncStore(s => s.last);

  useEffect(() => {
    if (useSyncStore.getState().loaded || loading) return;
    loading = loadPeer(db, secureSecrets)
      .then(saved => useSyncStore.getState().setPeer(saved?.peer ?? null))
      .catch(() => useSyncStore.getState().setPeer(null))
      .finally(() => {
        loading = null;
      });
  }, [db]);

  const refreshLibrary = useCallback(async () => {
    setLibrary(await loadLibrary(db));
    await usePlaylistStore.getState().load(db);
  }, [db, setLibrary]);

  const syncNow = useCallback(async () => {
    const store = useSyncStore.getState();
    if (store.running) return;
    const controller = new AbortController();
    current = controller;
    store.begin();
    try {
      const saved = await loadPeer(db, secureSecrets);
      if (!saved) {
        useSyncStore.getState().setPeer(null);
        useSyncStore.getState().fail('unpaired');
        return;
      }
      const summary = await runSync(
        db,
        saved.peer,
        saved.secret,
        {
          fetch: syncFetch,
          lock: withLibraryLock,
          partialFile,
          audioFileName,
          saveArt,
          savePeer: async next => {
            await savePeerDetails(db, next);
            useSyncStore.getState().setPeer(next);
          },
        },
        {
          signal: controller.signal,
          onProgress: next => useSyncStore.getState().setProgress(next),
          onSong: done => {
            if (done === 1 || done % RELOAD_EVERY === 0) refreshLibrary().catch(() => undefined);
          },
        }
      );
      await refreshLibrary();
      useSyncStore.getState().finish(summary);
    } catch (e) {
      // Favorites, playlists and songs that landed stay; show them.
      await refreshLibrary().catch(() => undefined);
      useSyncStore.getState().fail(asSyncError(e, controller.signal).code);
    } finally {
      if (current === controller) current = null;
    }
  }, [db, refreshLibrary]);

  const cancel = useCallback(() => {
    current?.abort();
  }, []);

  /**
   * Tells the desktop to drop this phone (best effort), then clears the
   * secret and the saved desktop. The synced songs stay in the library.
   * Returns false when the desktop could not be told, so the screen can say
   * to remove the phone there too.
   */
  const forget = useCallback(async (): Promise<boolean> => {
    current?.abort();
    const saved = await loadPeer(db, secureSecrets);
    let told = false;
    if (saved) {
      try {
        const host = await findHost(syncFetch, saved.peer.hosts, saved.peer.port);
        if (host) {
          await new SyncClient({
            fetch: syncFetch,
            host,
            port: saved.peer.port,
            deviceId: saved.peer.deviceId,
            secret: saved.secret,
            skew: saved.peer.skew,
          }).unpair();
          told = true;
        }
      } catch {
        // Unreachable or refused: forget locally anyway.
      }
    }
    await forgetPeer(db, secureSecrets);
    useSyncStore.getState().setPeer(null);
    return told;
  }, [db]);

  return { loaded, peer, running, progress, error, last, syncNow, cancel, forget };
}
