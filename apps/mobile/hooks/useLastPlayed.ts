import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  loadLastPlayed,
  saveLastStation,
  saveLastTrack,
  useLastPlayedStore,
} from '@/lib/last-played';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useRadioStore } from '@/stores/useRadioStore';

/** The position is written at most this often while a track plays, in seconds. */
export const POSITION_SAVE_INTERVAL_SECONDS = 5;

/**
 * Loads what played last and keeps it saved: the track id when a new library
 * track starts, its position every few seconds and on pause, and the station
 * when a station starts. Radio positions mean nothing, so only the station is kept.
 */
export function useLastPlayed(): void {
  const db = useSQLiteContext();

  useEffect(() => {
    let cancelled = false;
    loadLastPlayed(db)
      .then(saved => {
        if (!cancelled) useLastPlayedStore.getState().hydrate(saved);
      })
      .catch(() => {
        if (!cancelled) useLastPlayedStore.getState().hydrate({ track: null, station: null });
      });

    let previous = usePlayerStore.getState();
    let savedPosition = 0;
    const unsubscribe = usePlayerStore.subscribe(state => {
      const before = previous;
      previous = state;
      const track = state.currentTrack;
      if (!track) return;
      const changed = before.currentTrack?.id !== track.id;

      if (track.isLive) {
        if (!changed) return;
        const station = useRadioStore.getState().currentStationId;
        const found = [
          ...useRadioStore.getState().stations,
          ...useRadioStore.getState().favorites,
        ].find(s => s.id === station);
        if (found) {
          useLastPlayedStore.getState().set({ station: found });
          saveLastStation(db, found).catch(() => undefined);
        }
        return;
      }

      const paused = before.isPlaying && !state.isPlaying;
      const due = Math.abs(state.currentTime - savedPosition) >= POSITION_SAVE_INTERVAL_SECONDS;
      if (!changed && !paused && !due) return;
      if (changed) {
        // Resuming the saved track starts it at 0 before the seek lands; keep
        // the saved position until playback reports a real one.
        const saved = useLastPlayedStore.getState().track;
        if (saved?.id === track.id) {
          savedPosition = saved.position;
          return;
        }
      }
      savedPosition = changed ? 0 : state.currentTime;
      const next = { id: track.id, position: savedPosition };
      useLastPlayedStore.getState().set({ track: next });
      saveLastTrack(db, next).catch(() => undefined);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [db]);
}
