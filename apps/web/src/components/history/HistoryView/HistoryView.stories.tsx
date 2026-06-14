import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ListeningActivityPoint,
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
    lastPlayedAt: new Date('2026-06-14T00:00:00.000Z').toISOString(),
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
    playedAt: new Date('2026-06-14T09:30:00.000Z').toISOString(),
    playedSeconds: 198,
    completionRatio: 1,
    completed: true,
    source: 'library',
    ...overrides,
  };
}

function makeActivity(days: number): ListeningActivityPoint[] {
  const today = new Date('2026-06-14T00:00:00.000Z');
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - index));
    const playCount = (index * 5) % 9;
    return { date: date.toISOString().slice(0, 10), playCount, listenedMinutes: playCount * 3 };
  });
}

/** A client pre-seeded with history data for the default ("all") range. */
function seededClient(data: HistoryData): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(historyKeys.data('all'), data);
  return client;
}

const meta: Meta<typeof HistoryView> = {
  title: 'history/HistoryView',
  component: HistoryView,
  decorators: [
    Story => (
      <div className="flex h-[48rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryView>;

export const Default: Story = {
  decorators: [
    Story => {
      const client = seededClient({
        summary: {
          totalPlays: 248,
          totalMinutes: 1320,
          uniqueTracks: 96,
          uniqueArtists: 41,
          completedPlays: 180,
          topTracks: [
            makeTrack({ trackId: 'a', title: 'Midnight study session' }),
            makeTrack({ trackId: 'b', title: 'Rainy day cafe', playCount: 9 }),
          ],
          topArtists: [
            makeArtist({ artist: 'Lofi Collective' }),
            makeArtist({ artist: 'Chillhop', playCount: 31 }),
          ],
        },
        recent: [makeEntry({ id: 'r1' }), makeEntry({ id: 'r2', title: 'Slow morning coffee' })],
        activity: makeActivity(30),
      });
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      const client = seededClient({
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
      });
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};
