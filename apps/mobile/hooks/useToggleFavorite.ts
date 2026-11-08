import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { toggleFavoriteInDb } from '@/lib/library';
import { usePlayerStore } from '@/stores/usePlayerStore';

/** Flips a track's heart in the store and in SQLite. */
export function useToggleFavorite(): (trackId: string) => void {
  const db = useSQLiteContext();
  const toggle = usePlayerStore(s => s.toggleFavorite);
  return useCallback(
    (trackId: string) => {
      toggle(trackId);
      toggleFavoriteInDb(db, trackId).catch(() => toggle(trackId));
    },
    [db, toggle]
  );
}
