import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type {
  ListeningHistoryEntry,
  ListeningStatsArtist,
  ListeningStatsTrack,
} from '@/types/electron';
import { historyKeys, type HistoryData } from '@/hooks/queries/useHistory';

import HistoryView from './HistoryView';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 4200,
    lastPlayedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function makeArtist(overrides: Partial<ListeningStatsArtist> = {}): ListeningStatsArtist {
  return { artist: 'Lofi Collective', playCount: 42, listenedSeconds: 12000, ...overrides };
}

function makeEntry(overrides: Partial<ListeningHistoryEntry> = {}): ListeningHistoryEntry {
  return {
    id: 'entry-1',
    trackId: 'track-1',
    title: 'Rainy day cafe',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    duration: 198,
    playedAt: new Date(0).toISOString(),
    playedSeconds: 198,
    completionRatio: 1,
    completed: true,
    source: 'library',
    ...overrides,
  };
}

const EMPTY_DATA: HistoryData = {
  summary: {
    totalPlays: 0,
    totalMinutes: 0,
    uniqueTracks: 0,
    uniqueArtists: 0,
    completedPlays: 0,
    topTracks: [],
    topArtists: [],
  },
  recent: [],
  activity: [],
};

function renderWithClient(client: QueryClient, ui: ReactElement): void {
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function renderView(data?: HistoryData): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) {
    // The default range is "all" on first render.
    client.setQueryData(historyKeys.data('all'), data);
  }
  renderWithClient(client, <HistoryView />);
}

describe('HistoryView', () => {
  it('holds the loading skeleton before the history query settles', () => {
    // No seeded data — the query is in-flight on first render.
    renderView();

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the hero, stat cards, and section headings once loaded', () => {
    renderView({
      ...EMPTY_DATA,
      summary: {
        ...EMPTY_DATA.summary,
        totalPlays: 248,
        topTracks: [makeTrack()],
        topArtists: [makeArtist()],
      },
      recent: [makeEntry()],
    });

    expect(
      screen.getByText('A running picture of what you actually stick with.')
    ).toBeInTheDocument();
    expect(screen.getByText('Logged Plays')).toBeInTheDocument();
    expect(screen.getByText('248')).toBeInTheDocument();
    expect(screen.getByText('Top Tracks')).toBeInTheDocument();
    expect(screen.getByText('Top Artists')).toBeInTheDocument();
    expect(screen.getByText('Recent Plays')).toBeInTheDocument();
  });

  it('exposes every panel as a region named by its heading', () => {
    renderView({
      ...EMPTY_DATA,
      summary: { ...EMPTY_DATA.summary, topTracks: [makeTrack()], topArtists: [makeArtist()] },
      recent: [makeEntry()],
    });

    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Top Tracks' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Top Artists' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent Plays' })).toBeInTheDocument();
  });

  it('renders the row data inside their sections', () => {
    renderView({
      ...EMPTY_DATA,
      summary: {
        ...EMPTY_DATA.summary,
        topTracks: [makeTrack({ title: 'Midnight study session' })],
        topArtists: [makeArtist({ artist: 'Chillhop' })],
      },
      recent: [makeEntry({ title: 'Slow morning coffee' })],
    });

    expect(screen.getByText('Midnight study session')).toBeInTheDocument();
    expect(screen.getByText('Chillhop')).toBeInTheDocument();
    expect(screen.getByText('Slow morning coffee')).toBeInTheDocument();
  });

  it('shows section empty states when there is no data for the range', () => {
    renderView(EMPTY_DATA);

    expect(screen.getByText('No top tracks in this range')).toBeInTheDocument();
    expect(screen.getByText('No artist trends yet')).toBeInTheDocument();
    expect(screen.getByText('No recent plays in this range')).toBeInTheDocument();
  });
});
