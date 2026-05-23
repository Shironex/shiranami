import { create } from 'zustand';
import { logger } from '@/lib/logger';
import { type Station } from 'radio-browser-api';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';
import { radioApi as api } from '@/components/radio/radioApi';
import {
  buildStationQuery,
  hasActiveFilters,
  RADIO_PAGE_SIZE,
  type RadioFilters,
} from '@/components/radio/buildStationQuery';

let latestRadioRequestId = 0;

function beginRadioRequest(): number {
  latestRadioRequestId += 1;
  return latestRadioRequestId;
}

function isLatestRadioRequest(requestId: number): boolean {
  return requestId === latestRadioRequestId;
}

/** Live-search browse vs the saved favorites set. Country is now a filter. */
export type RadioMode = 'browse' | 'favorites';

const EMPTY_FILTERS: RadioFilters = {};

interface RadioState {
  stations: Station[];
  favorites: string[]; // station ids
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  filters: RadioFilters;
  mode: RadioMode;
  page: number;
  hasMore: boolean;
}

interface RadioActions {
  /** Runs a fresh search (page 0) from the current filter set. */
  runSearch: () => Promise<void>;
  /** Fetches and appends the next page of the current filter set. */
  loadMore: () => Promise<void>;
  loadTopStations: () => Promise<void>;
  loadFavorites: () => Promise<void>;
  toggleFavorite: (station: Station) => Promise<void>;
  isFavorite: (stationId: string) => boolean;
  /** Merges a partial filter patch and re-runs the search from page 0. */
  setFilter: (patch: Partial<RadioFilters>) => void;
  /** Clears every filter and re-runs the search (back to top stations). */
  clearFilters: () => void;
  setMode: (mode: RadioMode) => void;
  setError: (error: string | null) => void;
  hasActiveFilters: () => boolean;
}

export type RadioStore = RadioState & RadioActions;

export const useRadioStore = create<RadioStore>((set, get) => ({
  stations: [],
  favorites: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  filters: EMPTY_FILTERS,
  mode: 'browse',
  page: 0,
  hasMore: false,

  runSearch: async () => {
    const requestId = beginRadioRequest();
    const { filters } = get();
    set({ isLoading: true, error: null, mode: 'browse', page: 0 });
    try {
      const stations = await api.searchStations(buildStationQuery(filters, 0));
      if (!isLatestRadioRequest(requestId)) return;
      set({ stations, isLoading: false, hasMore: stations.length === RADIO_PAGE_SIZE });
    } catch (err) {
      if (!isLatestRadioRequest(requestId)) return;
      set({
        error: err instanceof Error ? err.message : i18n.t('searchFailed', { ns: 'toast' }),
        isLoading: false,
      });
    }
  },

  loadMore: async () => {
    const { filters, page, hasMore, isLoading, isLoadingMore, mode } = get();
    if (mode !== 'browse' || isLoading || isLoadingMore || !hasMore) return;
    const requestId = beginRadioRequest();
    const nextPage = page + 1;
    set({ isLoadingMore: true });
    try {
      const more = await api.searchStations(buildStationQuery(filters, nextPage));
      if (!isLatestRadioRequest(requestId)) return;
      set(state => ({
        stations: [...state.stations, ...more],
        page: nextPage,
        isLoadingMore: false,
        hasMore: more.length === RADIO_PAGE_SIZE,
      }));
    } catch (err) {
      if (!isLatestRadioRequest(requestId)) return;
      set({
        error: err instanceof Error ? err.message : i18n.t('failedLoadStations', { ns: 'toast' }),
        isLoadingMore: false,
      });
    }
  },

  loadTopStations: async () => {
    set({ filters: EMPTY_FILTERS });
    await get().runSearch();
  },

  loadFavorites: async () => {
    if (!IS_ELECTRON) return;
    const requestId = beginRadioRequest();
    set({ isLoading: true, error: null, mode: 'favorites', page: 0, hasMore: false });
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
      const favoriteIds = rows.map(r => r.stationUuid);
      // Convert DB rows to Station-like objects for display
      const stations = rows.map(r => ({
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
      set({
        error: err instanceof Error ? err.message : i18n.t('failedLoadFavorites', { ns: 'toast' }),
        isLoading: false,
      });
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
        set({ favorites: favorites.filter(f => f !== stationId) });
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
      logger.warn('[radio] Failed to toggle favorite:', err);
    }
  },

  isFavorite: (stationId: string) => {
    return get().favorites.includes(stationId);
  },

  setFilter: patch => {
    set(state => ({ filters: { ...state.filters, ...patch } }));
    void get().runSearch();
  },

  clearFilters: () => {
    set({ filters: EMPTY_FILTERS });
    void get().runSearch();
  },

  setMode: mode => set({ mode }),
  setError: error => set({ error }),
  hasActiveFilters: () => hasActiveFilters(get().filters),
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
