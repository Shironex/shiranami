import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Ensure i18n is initialised before RadioView imports (RadioView no longer
// imports @/lib/i18n directly — it uses the useTranslation hook).
import '@/lib/i18n';
import type { RadioFilters } from './buildStationQuery';
import type { RadioMode } from '@/stores/useRadioStore';
import { RadioView } from './RadioView';

const loadTopStations = vi.fn();
const loadFavorites = vi.fn();
const runSearch = vi.fn();
const loadMore = vi.fn();
const setFilter = vi.fn();
const clearFilters = vi.fn();

let mockState: {
  stations: unknown[];
  favorites: string[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  filters: RadioFilters;
  mode: RadioMode;
  hasMore: boolean;
};

function defaultState() {
  return {
    stations: [] as unknown[],
    favorites: [] as string[],
    isLoading: true,
    isLoadingMore: false,
    error: null as string | null,
    filters: {} as RadioFilters,
    mode: 'browse' as RadioMode,
    hasMore: false,
  };
}

vi.mock('@/stores/useRadioStore', () => ({
  useRadioStore: <T,>(selector: (s: Record<string, unknown>) => T) =>
    selector({
      ...mockState,
      runSearch,
      loadMore,
      loadTopStations,
      loadFavorites,
      toggleFavorite: vi.fn(),
      setFilter,
      clearFilters,
    }),
}));

vi.mock('./useRadioCatalog', () => ({
  useRadioCatalog: () => ({ countries: [], languages: [], tags: [] }),
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
    mockState = defaultState();
  });

  it('shows loading skeleton rows while isLoading', () => {
    const { container } = render(<RadioView />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(10);
  });

  it('loads top stations on first mount', () => {
    render(<RadioView />);
    expect(loadTopStations).toHaveBeenCalled();
  });

  it('switches to the favorites mode', async () => {
    const user = userEvent.setup();
    render(<RadioView />);

    await user.click(screen.getByRole('button', { name: /favorites/i }));

    expect(loadFavorites).toHaveBeenCalled();
  });

  it('clears the search input when filters.name is reset externally', async () => {
    const { rerender } = render(<RadioView />);

    // Simulate a name filter being active
    mockState = { ...defaultState(), isLoading: false, filters: { name: 'jazz' } };
    rerender(<RadioView />);

    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
    expect(input.value).toBe('jazz');

    // Simulate clearFilters resetting filters.name to undefined
    mockState = { ...defaultState(), isLoading: false, filters: {} };
    rerender(<RadioView />);

    expect(input.value).toBe('');
  });
});
