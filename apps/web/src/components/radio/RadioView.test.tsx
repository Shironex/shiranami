import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Ensure i18n is initialised before RadioView imports (RadioView no longer
// imports @/lib/i18n directly — it uses the useTranslation hook).
import '@/lib/i18n';
import { RadioView } from './RadioView';

const loadTopStations = vi.fn();
const loadByCountry = vi.fn();
const setActiveTab = vi.fn();
const setSearchQuery = vi.fn();

vi.mock('@/stores/useRadioStore', () => ({
  useRadioStore: <T,>(
    selector: (s: {
      stations: unknown[];
      favorites: string[];
      isLoading: boolean;
      error: string | null;
      searchQuery: string;
      selectedCountry: string;
      activeTab: string;
      searchStations: ReturnType<typeof vi.fn>;
      loadTopStations: typeof loadTopStations;
      loadByCountry: typeof loadByCountry;
      loadFavorites: ReturnType<typeof vi.fn>;
      toggleFavorite: ReturnType<typeof vi.fn>;
      setSearchQuery: typeof setSearchQuery;
      setSelectedCountry: ReturnType<typeof vi.fn>;
      setActiveTab: typeof setActiveTab;
    }) => T
  ) =>
    selector({
      stations: [],
      favorites: [],
      isLoading: true,
      error: null,
      searchQuery: '',
      selectedCountry: 'US',
      activeTab: 'top',
      searchStations: vi.fn(),
      loadTopStations,
      loadByCountry,
      loadFavorites: vi.fn(),
      toggleFavorite: vi.fn(),
      setSearchQuery,
      setSelectedCountry: vi.fn(),
      setActiveTab,
    }),
}));

vi.mock('@/stores/usePlaybackStore', () => ({
  usePlaybackStore: <T,>(
    selector: (s: {
      currentTrack: null;
      isPlaying: boolean;
      setQueue: ReturnType<typeof vi.fn>;
    }) => T
  ) =>
    selector({
      currentTrack: null,
      isPlaying: false,
      setQueue: vi.fn(),
    }),
}));

describe('RadioView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton rows while isLoading', () => {
    const { container } = render(<RadioView />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(10);
  });

  it('switches to country tab and loads by country', async () => {
    const user = userEvent.setup();
    render(<RadioView />);

    await user.click(screen.getByRole('button', { name: /by country/i }));

    expect(setActiveTab).toHaveBeenCalledWith('country');
    expect(setSearchQuery).toHaveBeenCalledWith('');
    expect(loadByCountry).toHaveBeenCalledWith('US');
  });
});
