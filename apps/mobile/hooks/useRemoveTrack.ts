import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useRemovalStore } from '@/stores/useRemovalStore';
import type { Track } from '@/stores/usePlayerStore';

/** Removes a song from the library, with an undo for a few seconds. */
export function useRemoveTrack(): (track: Track) => void {
  const db = useSQLiteContext();
  return useCallback((track: Track) => useRemovalStore.getState().remove(db, [track]), [db]);
}
