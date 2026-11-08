import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Loads the library from SQLite into the player store once the tabs mount.
 * Returns whether that first load has finished. */
export function useLibraryLoader(): boolean {
  const db = useSQLiteContext();
  const setLibrary = usePlayerStore(s => s.setLibrary);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    loadLibrary(db)
      .then(setLibrary)
      .finally(() => setLoaded(true));
  }, [db, setLibrary]);
  return loaded;
}
