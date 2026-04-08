import { create } from 'zustand';
import { RadioBrowserApi, type Station } from 'radio-browser-api';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

const api = new RadioBrowserApi('Shiranami/0.2.1');
let latestRadioRequestId = 0;

function beginRadioRequest(): number {
  latestRadioRequestId += 1;
  return latestRadioRequestId;
}

function isLatestRadioRequest(requestId: number): boolean {
  return requestId === latestRadioRequestId;
}

export type RadioSearchTab = 'top' | 'country' | 'favorites';

interface RadioState {
  stations: Station[];
  favorites: string[]; // station ids
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCountry: string;
  activeTab: RadioSearchTab;
}

interface RadioActions {
  searchStations: (query: string) => Promise<void>;
  loadTopStations: () => Promise<void>;
  loadByCountry: (countryCode: string) => Promise<void>;
  loadFavorites: () => Promise<void>;
  toggleFavorite: (station: Station) => Promise<void>;
  isFavorite: (stationId: string) => boolean;
  setSearchQuery: (query: string) => void;
  setSelectedCountry: (country: string) => void;
  setActiveTab: (tab: RadioSearchTab) => void;
  setError: (error: string | null) => void;
}

export type RadioStore = RadioState & RadioActions;

export const useRadioStore = create<RadioStore>((set, get) => ({
  stations: [],
  favorites: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedCountry: 'US',
  activeTab: 'top',

  searchStations: async (query: string) => {
    const requestId = beginRadioRequest();
    set({ isLoading: true, error: null });
    try {
      const stations = await api.searchStations({
        name: query,
        limit: 100,
        order: 'clickCount',
        reverse: true,
        hideBroken: true,
      });
      if (!isLatestRadioRequest(requestId)) return;
      set({ stations, isLoading: false });
    } catch (err) {
      if (!isLatestRadioRequest(requestId)) return;
      set({ error: err instanceof Error ? err.message : i18n.t('searchFailed', { ns: 'toast' }), isLoading: false });
    }
  },

  loadTopStations: async () => {
    const requestId = beginRadioRequest();
    set({ isLoading: true, error: null });
    try {
      const stations = await api.searchStations({
        limit: 100,
        order: 'clickCount',
        reverse: true,
        hideBroken: true,
      });
      if (!isLatestRadioRequest(requestId)) return;
      set({ stations, isLoading: false });
    } catch (err) {
      if (!isLatestRadioRequest(requestId)) return;
      set({ error: err instanceof Error ? err.message : i18n.t('failedLoadStations', { ns: 'toast' }), isLoading: false });
    }
  },

  loadByCountry: async (countryCode: string) => {
    const requestId = beginRadioRequest();
    set({ isLoading: true, error: null, selectedCountry: countryCode });
    try {
      const stations = await api.searchStations({
        countryCode,
        limit: 100,
        order: 'clickCount',
        reverse: true,
        hideBroken: true,
      });
      if (!isLatestRadioRequest(requestId)) return;
      set({ stations, isLoading: false });
    } catch (err) {
      if (!isLatestRadioRequest(requestId)) return;
      set({ error: err instanceof Error ? err.message : i18n.t('failedLoadStations', { ns: 'toast' }), isLoading: false });
    }
  },

  loadFavorites: async () => {
    if (!IS_ELECTRON) return;
    const requestId = beginRadioRequest();
    set({ isLoading: true, error: null });
    try {
      const rows = (await window.electronAPI.radio.favorites.getAll()) as Array<{
        stationUuid: string;
        name: string;
        urlResolved: string;
        url: string;
        homepage?: string;
        favicon?: string;
        country?: string;
        countryCode?: string;
        language?: string;
        codec?: string;
        bitrate?: number;
        tags?: string;
      }>;
      const favoriteIds = rows.map((r) => r.stationUuid);
      // Convert DB rows to Station-like objects for display
      const stations = rows.map((r) => ({
        changeId: '',
        id: r.stationUuid,
        name: r.name,
        url: r.url,
        urlResolved: r.urlResolved,
        homepage: r.homepage ?? '',
        favicon: r.favicon ?? '',
        country: r.country ?? '',
        countryCode: r.countryCode ?? '',
        state: '',
        language: r.language ? [r.language] : [],
        votes: 0,
        lastChangeTime: new Date(),
        codec: r.codec ?? '',
        bitrate: r.bitrate ?? 0,
        hls: false,
        lastCheckOk: true,
        lastCheckTime: new Date(),
        lastCheckOkTime: new Date(),
        lastLocalCheckTime: new Date(),
        clickTimestamp: new Date(),
        clickCount: 0,
        clickTrend: 0,
        tags: r.tags ? r.tags.split(',') : [],
      })) as Station[];
      if (!isLatestRadioRequest(requestId)) return;
      set({ stations, favorites: favoriteIds, isLoading: false });
    } catch (err) {
      if (!isLatestRadioRequest(requestId)) return;
      set({ error: err instanceof Error ? err.message : i18n.t('failedLoadFavorites', { ns: 'toast' }), isLoading: false });
    }
  },

  toggleFavorite: async (station: Station) => {
    if (!IS_ELECTRON) return;
    const { favorites } = get();
    const stationId = station.id;
    const isFav = favorites.includes(stationId);

    try {
      if (isFav) {
        await window.electronAPI.radio.favorites.remove(stationId);
        set({ favorites: favorites.filter((f) => f !== stationId) });
      } else {
        await window.electronAPI.radio.favorites.add({
          stationUuid: stationId,
          name: station.name,
          url: station.url,
          urlResolved: station.urlResolved,
          homepage: station.homepage || undefined,
          favicon: station.favicon || undefined,
          country: station.country || undefined,
          countryCode: station.countryCode || undefined,
          language: station.language?.join(',') || undefined,
          codec: station.codec || undefined,
          bitrate: station.bitrate || undefined,
          tags: station.tags?.join(',') || undefined,
        });
        set({ favorites: [...favorites, stationId] });
      }
    } catch (err) {
      console.warn('[radio] Failed to toggle favorite:', err);
    }
  },

  isFavorite: (stationId: string) => {
    return get().favorites.includes(stationId);
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCountry: (country) => set({ selectedCountry: country }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof useRadioStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useRadioStore.setState(data.store.getState());
  }
  data.store = useRadioStore;
  hot.accept();
}
