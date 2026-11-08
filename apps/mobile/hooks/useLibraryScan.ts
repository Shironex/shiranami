import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { AudioLibrary } from '@/modules/audio-library';
import { loadLibrary } from '@/lib/library';
import { libraryDeps } from '@/lib/library-files';
import { scanLibrary, type CancelToken } from '@/lib/library-scan';
import { ensureAudioPermission } from '@/lib/media-permission';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useScanStore } from '@/stores/useScanStore';

/** Batches between library reloads while a scan runs, so new songs show up as it goes. */
const RELOAD_EVERY = 8;

let current: CancelToken | null = null;

/** "Scan music on this phone": permission, the scan itself, progress and cancel. */
export function useLibraryScan() {
  const db = useSQLiteContext();
  const setLibrary = usePlayerStore(s => s.setLibrary);
  const running = useScanStore(s => s.running);
  const done = useScanStore(s => s.done);
  const total = useScanStore(s => s.total);
  const permission = useScanStore(s => s.permission);
  const last = useScanStore(s => s.last);
  const error = useScanStore(s => s.error);

  const scan = useCallback(async () => {
    const store = useScanStore.getState();
    if (store.running) return;
    const state = await ensureAudioPermission(AudioLibrary);
    store.setPermission(state);
    if (state !== 'granted' || !AudioLibrary) return;

    const token: CancelToken = { cancelled: false };
    current = token;
    store.begin();
    let batches = 0;
    let shown = 0;
    try {
      const result = await scanLibrary(
        db,
        { ...libraryDeps(), native: AudioLibrary },
        {
          token,
          onProgress: ({ done: d, total: t }) => useScanStore.getState().progress(d, t),
          onBatch: written => {
            batches++;
            // The first songs appear at once, then the list refreshes now and then.
            if (written > shown && (shown === 0 || batches % RELOAD_EVERY === 0)) {
              shown = written;
              loadLibrary(db).then(setLibrary);
            }
          },
        }
      );
      setLibrary(await loadLibrary(db));
      useScanStore.getState().finish(result);
    } catch (e) {
      useScanStore.getState().fail(e instanceof Error ? e.message : String(e));
    } finally {
      if (current === token) current = null;
    }
  }, [db, setLibrary]);

  const cancel = useCallback(() => {
    if (current) current.cancelled = true;
  }, []);

  return {
    scan,
    cancel,
    running,
    done,
    total,
    permission,
    last,
    error,
    available: AudioLibrary != null,
    openSettings: () => Linking.openSettings(),
  };
}
