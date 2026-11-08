import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useLibraryLoader } from '@/hooks/useLibraryLoader';
import { useRecordPlays } from '@/hooks/useRecordPlays';
import { usePlaylistStore } from '@/stores/usePlaylistStore';
import { useRadioStore } from '@/stores/useRadioStore';

/** Loads the library, playlists and saved stations once, and starts recording plays. */
export function useInitialData() {
  const db = useSQLiteContext();
  useLibraryLoader();
  useRecordPlays();
  useEffect(() => {
    usePlaylistStore.getState().load(db);
    useRadioStore.getState().loadFavorites(db);
  }, [db]);
}
