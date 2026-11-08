import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useLastPlayed } from '@/hooks/useLastPlayed';
import { useLibraryLoader } from '@/hooks/useLibraryLoader';
import { useRecordPlays } from '@/hooks/useRecordPlays';
import { usePlaylistStore } from '@/stores/usePlaylistStore';
import { useRadioStore } from '@/stores/useRadioStore';

/**
 * Loads the library, playlists and saved stations once, and starts recording plays
 * and what played last. Returns whether the library has loaded.
 */
export function useInitialData(): boolean {
  const db = useSQLiteContext();
  const libraryLoaded = useLibraryLoader();
  useLastPlayed();
  useRecordPlays();
  useEffect(() => {
    usePlaylistStore.getState().load(db);
    useRadioStore.getState().loadFavorites(db);
  }, [db]);
  return libraryLoaded;
}
