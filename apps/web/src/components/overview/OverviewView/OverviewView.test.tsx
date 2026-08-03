import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { useOverviewData } from '@/hooks/useOverviewData';
import type { WeeklyRecapState } from '@/hooks/useWeeklyRecap';
import OverviewView from './OverviewView';

// ── Mocks ──

const handleOpenFolder = vi.fn();
const navigateTo = vi.fn();

type OverviewData = ReturnType<typeof useOverviewData>;
let overviewData: OverviewData;
let weeklyRecap: WeeklyRecapState;

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

// The recap's eligibility (query + reveal window) is exercised by its own
// units; stub the hook so this render test stays provider-free.
vi.mock('@/hooks/useWeeklyRecap', () => ({
  useWeeklyRecap: () => weeklyRecap,
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

// Child sections are exercised by their own units; stub them so the render test
// isolates OverviewView's branching (loading / error / first-run / data).
vi.mock('@/components/overview/GreetingHero', () => ({
  GreetingHero: () => <div data-testid="hero" />,
}));
vi.mock('@/components/shared/WeeklyRecapCard', () => ({
  WeeklyRecapCard: () => <div data-testid="recap" />,
}));
vi.mock('@/components/overview/StatStrip', () => ({
  StatStrip: () => <div data-testid="stats" />,
}));
vi.mock('@/components/overview/TopThisWeek', () => ({
  TopThisWeek: () => <div data-testid="top" />,
}));
vi.mock('@/components/overview/ListeningClock', () => ({
  ListeningClock: () => <div data-testid="clock" />,
}));
vi.mock('@/components/overview/TopAlbums', () => ({
  TopAlbums: () => <div data-testid="albums" />,
}));
vi.mock('@/components/overview/RecentlyAdded', () => ({
  RecentlyAdded: () => <div data-testid="recents" />,
}));
vi.mock('@/components/overview/RecommendationsShelf', () => ({
  RecommendationsShelf: () => <div data-testid="recommendations" />,
}));
vi.mock('@/components/overview/SmartMixesShelf', () => ({
  SmartMixesShelf: () => <div data-testid="smart-mixes" />,
}));

describe('OverviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewData = makeData();
    weeklyRecap = { recap: null, visible: false };
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
    // No recap card while the reveal window says so.
    expect(screen.queryByTestId('recap')).not.toBeInTheDocument();
  });

  it('reveals the weekly recap card when the week has earned one', () => {
    overviewData = makeData({ hasLibrary: true, hasHistory: true });
    weeklyRecap = {
      visible: true,
      recap: {
        weekKey: '2026-07-27',
        totalPlays: 42,
        totalMinutes: 400,
        sessionCount: 11,
        topTrack: { title: 'Kiro', playCount: 9 },
        loudestHour: 23,
      },
    };
    render(<OverviewView />);
    expect(screen.getByTestId('recap')).toBeInTheDocument();
  });
});
