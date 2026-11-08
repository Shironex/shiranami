import { useEffect, useMemo } from 'react';
import { RADIO_GENRES, useRadioStore } from '@/stores/useRadioStore';
import type { RadioStation } from '@/lib/radio';
import { radioPresets } from '@/lib/radio-view';

const SEARCH_DELAY_MS = 400;

export const RADIO_CHIPS = [{ value: 'favorites', label: 'Saved' }, ...RADIO_GENRES] as const;

export type RadioItem =
  | { type: 'label'; key: string; text: string }
  | { type: 'station'; key: string; station: RadioStation }
  | { type: 'empty'; key: string; title: string; body: string }
  | { type: 'loading'; key: string };

function stationItems(stations: RadioStation[], prefix: string): RadioItem[] {
  return stations.map(station => ({ type: 'station', key: `${prefix}${station.id}`, station }));
}

/**
 * The Radio tab's rows: the popular stations for the chosen genre, or search
 * results while there is a query. Saved stations are the presets above the
 * list; the Saved chip lists every one of them.
 */
export function useRadioView() {
  const filter = useRadioStore(s => s.filter);
  const query = useRadioStore(s => s.query);
  const stations = useRadioStore(s => s.stations);
  const favorites = useRadioStore(s => s.favorites);
  const isLoading = useRadioStore(s => s.isLoading);
  const error = useRadioStore(s => s.error);
  const refresh = useRadioStore(s => s.refresh);

  // Search as the user types, once they pause.
  useEffect(() => {
    const id = setTimeout(refresh, query ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(id);
  }, [query, refresh]);

  const items = useMemo<RadioItem[]>(() => {
    const name = query.trim().toLowerCase();
    if (name) {
      const rows: RadioItem[] = [{ type: 'label', key: 'l-results', text: 'Results' }];
      if (isLoading && stations.length === 0) return [...rows, { type: 'loading', key: 'loading' }];
      if (stations.length === 0) {
        return [
          ...rows,
          {
            type: 'empty',
            key: 'empty',
            title: error ? 'Stations did not load' : 'No stations found',
            body: error
              ? 'Check the connection and try again.'
              : `Nothing matches "${query.trim()}".`,
          },
        ];
      }
      return [...rows, ...stationItems(stations, 'r-')];
    }

    if (filter === 'favorites') {
      return favorites.length
        ? stationItems(favorites, 'f-')
        : [
            {
              type: 'empty',
              key: 'empty',
              title: 'No saved stations',
              body: 'Tap the heart on a station to keep it here.',
            },
          ];
    }

    // Saved stations sit in the presets above the chips; the list is for browsing.
    const savedIds = new Set(favorites.map(f => f.id));
    const popular = stations.filter(s => !savedIds.has(s.id));
    // A failed load shows as the inline notice above the chips, so no rows here.
    if (error) return [];
    const genre = RADIO_GENRES.find(g => g.value === filter)?.label.toLowerCase() ?? filter;
    const rows: RadioItem[] = [{ type: 'label', key: 'l-pop', text: `Popular for ${genre}` }];
    if (isLoading && popular.length === 0) return [...rows, { type: 'loading', key: 'loading' }];
    return [...rows, ...stationItems(popular, 'p-')];
  }, [filter, query, stations, favorites, isLoading, error]);

  const favoriteIds = useMemo(() => new Set(favorites.map(f => f.id)), [favorites]);
  const presets = useMemo(() => (query.trim() ? [] : radioPresets(favorites)), [query, favorites]);
  return { items, favoriteIds, presets, favorites, error: query.trim() ? null : error, refresh };
}
