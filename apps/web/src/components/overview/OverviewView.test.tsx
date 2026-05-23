import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { useOverviewData } from '@/hooks/useOverviewData';
import OverviewView from './OverviewView';

// ── Mocks ──

const handleOpenFolder = vi.fn();
const navigateTo = vi.fn();

type OverviewData = ReturnType<typeof useOverviewData>;
let overviewData: OverviewData;

function makeData(overrides: Partial<OverviewData> = {}): OverviewData {
  return {
    summary: {
      totalPlays: 0,
      totalMinutes: 0,
      uniqueTracks: 0,
      uniqueArtists: 0,
      completedPlays: 0,
      topTracks: [],
      topArtists: [],
    },
    heatmap: { cells: [], hasData: false, peakHour: null, totalPlays: 0 },
    topAlbums: [],
    sessionCount: 0,
    trendDeltaMinutes: undefined,
    recentlyAdded: [],
    newInLibraryCount: 0,
    library: [],
    hasLibrary: false,
    hasHistory: false,
    libraryLoaded: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    handlePlayTrack: vi.fn(),
    ...overrides,
  };
}

vi.mock('@/hooks/useOverviewData', () => ({
  useOverviewData: () => overviewData,
}));

vi.mock('@/hooks/useLibraryActions', () => ({
  useLibraryActions: () => ({ handleOpenFolder, handleOpenFile: vi.fn(), isScanning: false }),
}));

vi.mock('@/stores/useViewStore', () => ({
  useViewStore: <T,>(selector: (s: { navigateTo: typeof navigateTo }) => T) =>
    selector({ navigateTo }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// Child sections are exercised by their own units; stub them so the render
// test isolates OverviewView's branching (loading / error / first-run / data).
vi.mock('./GreetingHero', () => ({ GreetingHero: () => <div data-testid="hero" /> }));
vi.mock('./StatStrip', () => ({ StatStrip: () => <div data-testid="stats" /> }));
vi.mock('./TopThisWeek', () => ({ TopThisWeek: () => <div data-testid="top" /> }));
vi.mock('./ListeningClock', () => ({ ListeningClock: () => <div data-testid="clock" /> }));
vi.mock('./TopAlbums', () => ({ TopAlbums: () => <div data-testid="albums" /> }));
vi.mock('./RecentlyAdded', () => ({ RecentlyAdded: () => <div data-testid="recents" /> }));

describe('OverviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewData = makeData();
  });

  it('shows the first-run empty state when there is no library', () => {
    render(<OverviewView />);
    expect(screen.getByText('firstRunTitle')).toBeInTheDocument();
    expect(screen.getByText('firstRunSubtitle')).toBeInTheDocument();
    // None of the data sections render on first run.
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats')).not.toBeInTheDocument();
  });

  it('shows the skeleton while loading', () => {
    overviewData = makeData({ isLoading: true });
    const { container } = render(<OverviewView />);
    expect(screen.queryByText('firstRunTitle')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows the error state with a retry action on error', () => {
    overviewData = makeData({ isError: true });
    render(<OverviewView />);
    expect(screen.getByText('errorTitle')).toBeInTheDocument();
  });

  it('renders the hero + a quiet section-empty when the library has no plays yet', () => {
    overviewData = makeData({ hasLibrary: true, hasHistory: false });
    render(<OverviewView />);
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.getByText('emptySectionTitle')).toBeInTheDocument();
    // Data sections stay hidden until there's history.
    expect(screen.queryByTestId('stats')).not.toBeInTheDocument();
    expect(screen.queryByTestId('top')).not.toBeInTheDocument();
  });

  it('renders all data sections once history exists', () => {
    overviewData = makeData({
      hasLibrary: true,
      hasHistory: true,
      recentlyAdded: [
        { id: 't1', title: 'Song', artist: 'A', album: '', duration: 0, filePath: '' },
      ],
    });
    render(<OverviewView />);
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.getByTestId('stats')).toBeInTheDocument();
    expect(screen.getByTestId('top')).toBeInTheDocument();
    expect(screen.getByTestId('clock')).toBeInTheDocument();
    expect(screen.getByTestId('albums')).toBeInTheDocument();
    expect(screen.getByTestId('recents')).toBeInTheDocument();
  });
});
