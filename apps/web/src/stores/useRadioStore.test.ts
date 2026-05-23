import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from 'radio-browser-api';

const { mockSearchStations } = vi.hoisted(() => ({
  mockSearchStations: vi.fn(),
}));

vi.mock('radio-browser-api', () => ({
  RadioBrowserApi: vi.fn().mockImplementation(function () {
    return {
      searchStations: mockSearchStations,
      getStationsByVotes: vi.fn(),
    };
  }),
}));

vi.mock('@/lib/platform', () => ({
  IS_ELECTRON: true,
  IS_WINDOWS: false,
  IS_MAC: false,
}));

vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key },
}));

// Ensure HMR guard in the store module doesn't blow up during tests
if (import.meta.hot) {
  (import.meta.hot as { data: Record<string, unknown> }).data ??= {};
}

// Must import after mocks are set up
import { useRadioStore } from './useRadioStore';

function makeStation(id: string, overrides?: Partial<Station>): Station {
  return {
    changeId: '',
    id,
    name: `Station ${id}`,
    url: `http://stream.${id}.com`,
    urlResolved: `http://stream.${id}.com/resolved`,
    homepage: `http://${id}.com`,
    favicon: `http://${id}.com/favicon.ico`,
    tags: ['rock'],
    country: 'United States',
    countryCode: 'US',
    state: '',
    language: ['english'],
    votes: 100,
    lastChangeTime: new Date(),
    codec: 'MP3',
    bitrate: 128,
    hls: false,
    lastCheckOk: true,
    lastCheckTime: new Date(),
    lastCheckOkTime: new Date(),
    lastLocalCheckTime: new Date(),
    clickTimestamp: new Date(),
    clickCount: 500,
    clickTrend: 10,
    ...overrides,
  };
}

function resetStore() {
  useRadioStore.setState({
    stations: [],
    favorites: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    filters: {},
    mode: 'browse',
    page: 0,
    hasMore: false,
  });
}

describe('useRadioStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // --- runSearch ---
  describe('runSearch', () => {
    it('sets isLoading true then stations on success', async () => {
      const stations = [makeStation('s1'), makeStation('s2')];
      mockSearchStations.mockResolvedValueOnce(stations);

      useRadioStore.setState({ filters: { name: 'rock' } });
      const promise = useRadioStore.getState().runSearch();

      // isLoading should be true immediately
      expect(useRadioStore.getState().isLoading).toBe(true);
      expect(useRadioStore.getState().error).toBeNull();

      await promise;

      const state = useRadioStore.getState();
      expect(state.stations).toEqual(stations);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.mode).toBe('browse');
    });

    it('composes name, countryCode, language and tagList into one query', async () => {
      mockSearchStations.mockResolvedValueOnce([]);

      useRadioStore.setState({
        filters: {
          name: '  lofi  ',
          countryCode: 'CY',
          language: 'greek',
          tagList: ['jazz', 'house'],
        },
      });
      await useRadioStore.getState().runSearch();

      expect(mockSearchStations).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'lofi',
          countryCode: 'CY',
          language: 'greek',
          tagList: ['jazz', 'house'],
          limit: 100,
          offset: 0,
          order: 'clickCount',
          reverse: true,
          hideBroken: true,
        })
      );
    });

    it('omits empty filter dimensions from the query', async () => {
      mockSearchStations.mockResolvedValueOnce([]);

      useRadioStore.setState({ filters: { countryCode: 'PL' } });
      await useRadioStore.getState().runSearch();

      const query = mockSearchStations.mock.calls[0][0];
      expect(query).not.toHaveProperty('name');
      expect(query).not.toHaveProperty('language');
      expect(query).not.toHaveProperty('tagList');
      expect(query.countryCode).toBe('PL');
    });

    it('sets hasMore when a full page is returned', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => makeStation(`s${i}`));
      mockSearchStations.mockResolvedValueOnce(fullPage);

      await useRadioStore.getState().runSearch();

      expect(useRadioStore.getState().hasMore).toBe(true);
    });

    it('clears hasMore when a partial page is returned', async () => {
      mockSearchStations.mockResolvedValueOnce([makeStation('s1')]);

      await useRadioStore.getState().runSearch();

      expect(useRadioStore.getState().hasMore).toBe(false);
    });

    it('sets error and isLoading false on failure', async () => {
      mockSearchStations.mockRejectedValueOnce(new Error('Network failure'));

      useRadioStore.setState({ filters: { name: 'jazz' } });
      await useRadioStore.getState().runSearch();

      const state = useRadioStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network failure');
      expect(state.stations).toEqual([]);
    });

    it('uses i18n fallback when error is not an Error instance', async () => {
      mockSearchStations.mockRejectedValueOnce('string error');

      useRadioStore.setState({ filters: { name: 'jazz' } });
      await useRadioStore.getState().runSearch();

      expect(useRadioStore.getState().error).toBe('searchFailed');
    });
  });

  // --- loadMore (pagination) ---
  describe('loadMore', () => {
    it('appends the next page and advances offset', async () => {
      const firstPage = Array.from({ length: 100 }, (_, i) => makeStation(`a${i}`));
      mockSearchStations.mockResolvedValueOnce(firstPage);
      useRadioStore.setState({ filters: { countryCode: 'PL' } });
      await useRadioStore.getState().runSearch();

      const secondPage = [makeStation('b1'), makeStation('b2')];
      mockSearchStations.mockResolvedValueOnce(secondPage);
      await useRadioStore.getState().loadMore();

      const state = useRadioStore.getState();
      expect(state.stations).toHaveLength(102);
      expect(state.page).toBe(1);
      expect(state.hasMore).toBe(false);
      expect(mockSearchStations).toHaveBeenLastCalledWith(
        expect.objectContaining({ countryCode: 'PL', offset: 100, limit: 100 })
      );
    });

    it('does nothing when there is no next page', async () => {
      mockSearchStations.mockResolvedValueOnce([makeStation('only')]);
      await useRadioStore.getState().runSearch();
      mockSearchStations.mockClear();

      await useRadioStore.getState().loadMore();

      expect(mockSearchStations).not.toHaveBeenCalled();
    });
  });

  // --- setFilter / clearFilters ---
  describe('setFilter', () => {
    it('merges a filter patch and re-runs the search', async () => {
      mockSearchStations.mockResolvedValue([]);

      useRadioStore.getState().setFilter({ countryCode: 'JP' });
      await Promise.resolve();
      await Promise.resolve();

      expect(useRadioStore.getState().filters.countryCode).toBe('JP');
      expect(mockSearchStations).toHaveBeenCalledWith(
        expect.objectContaining({ countryCode: 'JP' })
      );
    });
  });

  describe('clearFilters', () => {
    it('empties filters and re-runs the search', async () => {
      mockSearchStations.mockResolvedValue([]);
      useRadioStore.setState({ filters: { countryCode: 'JP', language: 'japanese' } });

      useRadioStore.getState().clearFilters();
      await Promise.resolve();
      await Promise.resolve();

      expect(useRadioStore.getState().filters).toEqual({});
      const query = mockSearchStations.mock.calls.at(-1)?.[0];
      expect(query).not.toHaveProperty('countryCode');
      expect(query).not.toHaveProperty('language');
    });
  });

  describe('hasActiveFilters', () => {
    it('is false with no filters and true once a facet is set', () => {
      expect(useRadioStore.getState().hasActiveFilters()).toBe(false);
      useRadioStore.setState({ filters: { tagList: ['rock'] } });
      expect(useRadioStore.getState().hasActiveFilters()).toBe(true);
    });
  });

  // --- race condition ---
  describe('race condition handling', () => {
    it('clears isLoadingMore when runSearch supersedes a slow loadMore', async () => {
      // Start with a full first page so loadMore is allowed
      const firstPage = Array.from({ length: 100 }, (_, i) => makeStation(`a${i}`));
      mockSearchStations.mockResolvedValueOnce(firstPage);
      await useRadioStore.getState().runSearch();

      // Kick off a slow loadMore
      let resolveLoadMore!: (value: Station[]) => void;
      const stalePromise = new Promise<Station[]>(r => {
        resolveLoadMore = r;
      });
      mockSearchStations.mockReturnValueOnce(stalePromise);
      const loadMoreP = useRadioStore.getState().loadMore();

      expect(useRadioStore.getState().isLoadingMore).toBe(true);

      // runSearch supersedes it before the loadMore resolves
      mockSearchStations.mockResolvedValueOnce([makeStation('fresh')]);
      await useRadioStore.getState().runSearch();

      // runSearch should have cleared isLoadingMore
      expect(useRadioStore.getState().isLoadingMore).toBe(false);

      // Now resolve the stale loadMore — isLoadingMore must remain false
      resolveLoadMore([makeStation('stale-more')]);
      await loadMoreP;

      expect(useRadioStore.getState().isLoadingMore).toBe(false);
    });

    it('ignores stale search results when a newer request is in flight', async () => {
      const staleStations = [makeStation('stale')];
      const freshStations = [makeStation('fresh')];

      // First call resolves slowly, second resolves immediately
      let resolveFirst!: (value: Station[]) => void;
      const firstPromise = new Promise<Station[]>(r => {
        resolveFirst = r;
      });

      mockSearchStations.mockReturnValueOnce(firstPromise).mockResolvedValueOnce(freshStations);

      useRadioStore.setState({ filters: { name: 'old query' } });
      const p1 = useRadioStore.getState().runSearch();
      useRadioStore.setState({ filters: { name: 'new query' } });
      const p2 = useRadioStore.getState().runSearch();

      // Let the second one finish first
      await p2;
      expect(useRadioStore.getState().stations).toEqual(freshStations);

      // Now resolve the stale first request
      resolveFirst(staleStations);
      await p1;

      // Stale result should be ignored
      expect(useRadioStore.getState().stations).toEqual(freshStations);
    });
  });

  // --- loadTopStations ---
  describe('loadTopStations', () => {
    it('fetches and sets stations', async () => {
      const stations = [makeStation('top1'), makeStation('top2')];
      mockSearchStations.mockResolvedValueOnce(stations);

      await useRadioStore.getState().loadTopStations();

      const state = useRadioStore.getState();
      expect(state.stations).toEqual(stations);
      expect(state.isLoading).toBe(false);
      expect(state.filters).toEqual({});
      const query = mockSearchStations.mock.calls.at(-1)?.[0];
      expect(query).toEqual(
        expect.objectContaining({
          limit: 100,
          offset: 0,
          order: 'clickCount',
          reverse: true,
          hideBroken: true,
        })
      );
      expect(query).not.toHaveProperty('name');
      expect(query).not.toHaveProperty('countryCode');
    });

    it('resets stale filters before fetching', async () => {
      mockSearchStations.mockResolvedValueOnce([]);
      useRadioStore.setState({ filters: { countryCode: 'PL', name: 'old' } });

      await useRadioStore.getState().loadTopStations();

      expect(useRadioStore.getState().filters).toEqual({});
    });

    it('sets error on failure', async () => {
      mockSearchStations.mockRejectedValueOnce(new Error('Server error'));

      await useRadioStore.getState().loadTopStations();

      expect(useRadioStore.getState().error).toBe('Server error');
      expect(useRadioStore.getState().isLoading).toBe(false);
    });
  });

  // --- toggleFavorite ---
  describe('toggleFavorite', () => {
    it('adds station to favorites when not favorited', async () => {
      const station = makeStation('fav1');

      await useRadioStore.getState().toggleFavorite(station);

      expect(useRadioStore.getState().favorites).toContain('fav1');
      expect(window.electronAPI.radio.favorites.add).toHaveBeenCalledWith(
        expect.objectContaining({ stationUuid: 'fav1', name: 'Station fav1' })
      );
    });

    it('removes station from favorites when already favorited', async () => {
      useRadioStore.setState({ favorites: ['fav1', 'fav2'] });
      const station = makeStation('fav1');

      await useRadioStore.getState().toggleFavorite(station);

      expect(useRadioStore.getState().favorites).toEqual(['fav2']);
      expect(window.electronAPI.radio.favorites.remove).toHaveBeenCalledWith('fav1');
    });
  });

  // --- isFavorite ---
  describe('isFavorite', () => {
    it('returns true for favorited station', () => {
      useRadioStore.setState({ favorites: ['s1', 's2'] });

      expect(useRadioStore.getState().isFavorite('s1')).toBe(true);
    });

    it('returns false for non-favorited station', () => {
      useRadioStore.setState({ favorites: ['s1', 's2'] });

      expect(useRadioStore.getState().isFavorite('s3')).toBe(false);
    });

    it('returns false when favorites is empty', () => {
      expect(useRadioStore.getState().isFavorite('s1')).toBe(false);
    });
  });

  // --- loadFavorites ---
  describe('loadFavorites', () => {
    it('loads from DB, maps rows, and sets favorites array', async () => {
      const dbRows = [
        {
          stationUuid: 'db1',
          name: 'DB Station 1',
          urlResolved: 'http://db1.com/stream',
          url: 'http://db1.com',
          homepage: 'http://db1.com',
          favicon: 'http://db1.com/icon.png',
          country: 'Poland',
          countryCode: 'PL',
          language: 'polish',
          codec: 'AAC',
          bitrate: 256,
          tags: 'pop,rock',
        },
        {
          stationUuid: 'db2',
          name: 'DB Station 2',
          urlResolved: 'http://db2.com/stream',
          url: 'http://db2.com',
        },
      ];

      vi.mocked(window.electronAPI.radio.favorites.getAll).mockResolvedValueOnce(dbRows);

      await useRadioStore.getState().loadFavorites();

      const state = useRadioStore.getState();
      expect(state.favorites).toEqual(['db1', 'db2']);
      expect(state.stations).toHaveLength(2);
      expect(state.isLoading).toBe(false);

      // Verify mapping of first station
      const s1 = state.stations[0];
      expect(s1.id).toBe('db1');
      expect(s1.name).toBe('DB Station 1');
      expect(s1.countryCode).toBe('PL');
      expect(s1.codec).toBe('AAC');
      expect(s1.bitrate).toBe(256);
      expect(s1.tags).toEqual(['pop', 'rock']);

      // Verify defaults for second station with missing optional fields
      const s2 = state.stations[1];
      expect(s2.id).toBe('db2');
      expect(s2.homepage).toBe('');
      expect(s2.favicon).toBe('');
      expect(s2.country).toBe('');
      expect(s2.language).toEqual([]);
      expect(s2.tags).toEqual([]);
    });

    it('sets error on failure', async () => {
      vi.mocked(window.electronAPI.radio.favorites.getAll).mockRejectedValueOnce(
        new Error('DB error')
      );

      await useRadioStore.getState().loadFavorites();

      expect(useRadioStore.getState().error).toBe('DB error');
      expect(useRadioStore.getState().isLoading).toBe(false);
    });
  });

  // --- setMode ---
  describe('setMode', () => {
    it('updates mode state', () => {
      useRadioStore.getState().setMode('favorites');
      expect(useRadioStore.getState().mode).toBe('favorites');

      useRadioStore.getState().setMode('browse');
      expect(useRadioStore.getState().mode).toBe('browse');
    });
  });
});
