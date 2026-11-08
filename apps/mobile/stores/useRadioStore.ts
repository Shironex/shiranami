import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import Constants from 'expo-constants';
import { RadioBrowserApi } from 'radio-browser-api';
import {
  deleteFavoriteStation,
  fromApi,
  loadFavoriteStations,
  saveFavoriteStation,
  type RadioStation,
} from '@/lib/radio';

const appVersion = Constants.expoConfig?.version ?? '0.1.0';
const api = new RadioBrowserApi(`Shiranami/${appVersion}`);
const LIMIT = 40;

/** Genre chips; the value is the radio-browser tag. */
export const RADIO_GENRES = [
  { value: 'lofi', label: 'Lofi' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'ambient', label: 'Ambient' },
  { value: 'japan', label: 'Japan' },
] as const;

export type RadioGenre = (typeof RADIO_GENRES)[number]['value'];
export type RadioFilter = RadioGenre | 'favorites';

let latestRequest = 0;

interface RadioState {
  filter: RadioFilter;
  query: string;
  /** Popular stations for the selected genre, or search results. */
  stations: RadioStation[];
  favorites: RadioStation[];
  isLoading: boolean;
  error: string | null;
  currentStationId: string | null;
}

interface RadioActions {
  setFilter: (filter: RadioFilter) => void;
  setQuery: (query: string) => void;
  /** Loads the list for the current filter and query. */
  refresh: () => Promise<void>;
  loadFavorites: (db: SQLiteDatabase) => Promise<void>;
  toggleFavorite: (db: SQLiteDatabase, station: RadioStation) => Promise<void>;
  setCurrentStation: (id: string | null) => void;
}

export const useRadioStore = create<RadioState & RadioActions>((set, get) => ({
  filter: 'lofi',
  query: '',
  stations: [],
  favorites: [],
  isLoading: false,
  error: null,
  currentStationId: null,

  setFilter: filter => {
    set({ filter });
    get().refresh();
  },
  setQuery: query => set({ query }),

  refresh: async () => {
    const { filter, query } = get();
    const name = query.trim();
    if (filter === 'favorites' && !name) {
      set({ stations: [], isLoading: false, error: null });
      return;
    }
    const request = ++latestRequest;
    set({ isLoading: true, error: null });
    try {
      const results = await api.searchStations({
        ...(name ? { name } : { tag: filter }),
        limit: LIMIT,
        order: 'clickCount',
        reverse: true,
        hideBroken: true,
      });
      if (request !== latestRequest) return;
      set({ stations: results.map(fromApi), isLoading: false });
    } catch {
      if (request !== latestRequest) return;
      set({ stations: [], isLoading: false, error: 'Stations did not load.' });
    }
  },

  loadFavorites: async db => {
    set({ favorites: await loadFavoriteStations(db) });
  },

  toggleFavorite: async (db, station) => {
    const saved = get().favorites.some(f => f.id === station.id);
    if (saved) await deleteFavoriteStation(db, station.id);
    else await saveFavoriteStation(db, station);
    await get().loadFavorites(db);
  },

  setCurrentStation: currentStationId => set({ currentStationId }),
}));
