import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { countsAsPlay, recordPlay } from '@/lib/history';
import { usePlayerStore } from '@/stores/usePlayerStore';

/**
 * Writes a history entry when a track that played long enough is left
 * (skipped, finished or replaced). Radio is not recorded.
 */
export function useRecordPlays(): void {
  const db = useSQLiteContext();
  useEffect(() => {
    let last = usePlayerStore.getState();
    return usePlayerStore.subscribe(state => {
      const previous = last;
      last = state;
      const track = previous.currentTrack;
      if (!track || track.isLive || state.currentTrack?.id === track.id) return;
      if (countsAsPlay(previous.currentTime, previous.duration)) {
        recordPlay(db, track.id, previous.currentTime, previous.duration).catch(() => undefined);
      }
    });
  }, [db]);
}
