import { create } from 'zustand';
import Constants from 'expo-constants';
import { RadioBrowserApi, type Station } from 'radio-browser-api';

const appVersion = Constants.expoConfig?.version ?? '0.1.0';
const api = new RadioBrowserApi(`Shiranami/${appVersion}`);
let latestRequestId = 0;

function beginRequest(): number {
  return ++latestRequestId;
}

function isCurrent(id: number): boolean {
  return id === latestRequestId;
}

export type RadioTab = 'top' | 'search' | 'favorites';

interface RadioState {
  stations: Station[];
  favoriteIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  activeTab: RadioTab;
  currentStation: Station | null;
}

interface RadioActions {
  loadTopStations: () => Promise<void>;
  searchStations: (query: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setActiveTab: (tab: RadioTab) => void;
  setCurrentStation: (station: Station | null) => void;
  toggleFavorite: (stationId: string) => void;
  isFavorite: (stationId: string) => boolean;
  setFavoriteIds: (ids: Set<string>) => void;
}

export const useRadioStore = create<RadioState & RadioActions>((set, get) => ({
  stations: [],
  favoriteIds: new Set(),
  isLoading: false,
  error: null,
  searchQuery: '',
  activeTab: 'top',
  currentStation: null,

  loadTopStations: async () => {
    const reqId = beginRequest();
    set({ isLoading: true, error: null });
    try {
      const stations = await api.searchStations({
        limit: 100,
        order: 'clickCount',
        reverse: true,
        hideBroken: true,
      });
      if (!isCurrent(reqId)) return;
      set({ stations, isLoading: false });
    } catch (err) {
      if (!isCurrent(reqId)) return;
      set({
        error: err instanceof Error ? err.message : 'Failed to load stations',
        isLoading: false,
      });
    }
  },

  searchStations: async (query: string) => {
    const reqId = beginRequest();
    set({ isLoading: true, error: null });
    try {
      const stations = await api.searchStations({
        name: query,
        limit: 100,
        order: 'clickCount',
        reverse: true,
        hideBroken: true,
      });
      if (!isCurrent(reqId)) return;
      set({ stations, isLoading: false });
    } catch (err) {
      if (!isCurrent(reqId)) return;
      set({ error: err instanceof Error ? err.message : 'Search failed', isLoading: false });
    }
  },

  setSearchQuery: searchQuery => set({ searchQuery }),
  setActiveTab: activeTab => set({ activeTab }),
  setCurrentStation: currentStation => set({ currentStation }),

  toggleFavorite: (stationId: string) => {
    const { favoriteIds } = get();
    const newFavs = new Set(favoriteIds);
    if (newFavs.has(stationId)) {
      newFavs.delete(stationId);
    } else {
      newFavs.add(stationId);
    }
    set({ favoriteIds: newFavs });
  },

  isFavorite: (stationId: string) => get().favoriteIds.has(stationId),
  setFavoriteIds: ids => set({ favoriteIds: ids }),
}));
