import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from 'radio-browser-api';

const { mockSearchStations } = vi.hoisted(() => ({
  mockSearchStations: vi.fn(),
}));

vi.mock('radio-browser-api', () => ({
  RadioBrowserApi: vi.fn().mockImplementation(() => ({
    searchStations: mockSearchStations,
    getStationsByVotes: vi.fn(),
  })),
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
  import.meta.hot.data ??= {};
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
    error: null,
    searchQuery: '',
    selectedCountry: 'US',
    activeTab: 'top',
  });
}

describe('useRadioStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // --- searchStations ---
  describe('searchStations', () => {
    it('sets isLoading true then stations on success', async () => {
      const stations = [makeStation('s1'), makeStation('s2')];
      mockSearchStations.mockResolvedValueOnce(stations);

      const promise = useRadioStore.getState().searchStations('rock');

      // isLoading should be true immediately
      expect(useRadioStore.getState().isLoading).toBe(true);
      expect(useRadioStore.getState().error).toBeNull();

      await promise;

      const state = useRadioStore.getState();
      expect(state.stations).toEqual(stations);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error and isLoading false on failure', async () => {
      mockSearchStations.mockRejectedValueOnce(new Error('Network failure'));

      await useRadioStore.getState().searchStations('jazz');

      const state = useRadioStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network failure');
      expect(state.stations).toEqual([]);
    });

    it('uses i18n fallback when error is not an Error instance', async () => {
      mockSearchStations.mockRejectedValueOnce('string error');

      await useRadioStore.getState().searchStations('jazz');

      expect(useRadioStore.getState().error).toBe('searchFailed');
    });
  });

  // --- race condition ---
  describe('race condition handling', () => {
    it('ignores stale search results when a newer request is in flight', async () => {
      const staleStations = [makeStation('stale')];
      const freshStations = [makeStation('fresh')];

      // First call resolves slowly, second resolves immediately
      let resolveFirst!: (value: Station[]) => void;
      const firstPromise = new Promise<Station[]>((r) => {
        resolveFirst = r;
      });

      mockSearchStations
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce(freshStations);

      const p1 = useRadioStore.getState().searchStations('old query');
      const p2 = useRadioStore.getState().searchStations('new query');

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
      expect(mockSearchStations).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          order: 'clickCount',
          reverse: true,
          hideBroken: true,
        })
      );
    });

    it('sets error on failure', async () => {
      mockSearchStations.mockRejectedValueOnce(new Error('Server error'));

      await useRadioStore.getState().loadTopStations();

      expect(useRadioStore.getState().error).toBe('Server error');
      expect(useRadioStore.getState().isLoading).toBe(false);
    });
  });

  // --- loadByCountry ---
  describe('loadByCountry', () => {
    it('updates selectedCountry and fetches stations', async () => {
      const stations = [makeStation('pl1')];
      mockSearchStations.mockResolvedValueOnce(stations);

      await useRadioStore.getState().loadByCountry('PL');

      const state = useRadioStore.getState();
      expect(state.selectedCountry).toBe('PL');
      expect(state.stations).toEqual(stations);
      expect(state.isLoading).toBe(false);
      expect(mockSearchStations).toHaveBeenCalledWith(
        expect.objectContaining({ countryCode: 'PL' })
      );
    });

    it('sets error on failure', async () => {
      mockSearchStations.mockRejectedValueOnce(new Error('Country error'));

      await useRadioStore.getState().loadByCountry('XX');

      expect(useRadioStore.getState().error).toBe('Country error');
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

  // --- setActiveTab ---
  describe('setActiveTab', () => {
    it('updates activeTab state', () => {
      useRadioStore.getState().setActiveTab('favorites');
      expect(useRadioStore.getState().activeTab).toBe('favorites');

      useRadioStore.getState().setActiveTab('country');
      expect(useRadioStore.getState().activeTab).toBe('country');

      useRadioStore.getState().setActiveTab('top');
      expect(useRadioStore.getState().activeTab).toBe('top');
    });
  });
});
