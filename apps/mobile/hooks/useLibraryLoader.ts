import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Loads the library from SQLite into the player store once the tabs mount. */
export function useLibraryLoader(): void {
  const db = useSQLiteContext();
  const setLibrary = usePlayerStore(s => s.setLibrary);
  useEffect(() => {
    loadLibrary(db).then(setLibrary);
  }, [db, setLibrary]);
}
