import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import { libraryDeps } from '@/lib/library-files';
import { backfillHashes } from '@/lib/library-scan';
import { usePlayerStore } from '@/stores/usePlayerStore';

/**
 * Loads the library from SQLite into the player store once the tabs mount,
 * then, once the screen has settled, hashes and tags rows from older builds.
 */
export function useLibraryLoader(): void {
  const db = useSQLiteContext();
  const setLibrary = usePlayerStore(s => s.setLibrary);
  useEffect(() => {
    const token = { cancelled: false };
    let task: { cancel: () => void } | null = null;
    loadLibrary(db).then(tracks => {
      if (token.cancelled) return;
      setLibrary(tracks);
      task = InteractionManager.runAfterInteractions(() => {
        backfillHashes(db, libraryDeps(), token)
          .then(changed => {
            if (changed > 0 && !token.cancelled) return loadLibrary(db).then(setLibrary);
          })
          .catch(() => undefined);
      });
    });
    return () => {
      token.cancelled = true;
      task?.cancel();
    };
  }, [db, setLibrary]);
}
