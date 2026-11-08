import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useRadioStore } from '@/stores/useRadioStore';

/** The station on air, whether it is saved, and a way to save or unsave it. */
export function useCurrentStation() {
  const db = useSQLiteContext();
  const station = useRadioStore(s => {
    const id = s.currentStationId;
    if (!id) return null;
    return s.favorites.find(f => f.id === id) ?? s.stations.find(f => f.id === id) ?? null;
  });
  const saved = useRadioStore(s => !!station && s.favorites.some(f => f.id === station.id));
  const toggleFavorite = useRadioStore(s => s.toggleFavorite);
  const toggle = useCallback(() => {
    if (station) toggleFavorite(db, station);
  }, [db, station, toggleFavorite]);
  return { station, saved, toggle };
}
