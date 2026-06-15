import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
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

/**
 * history · HistoryView. The full Listening History dashboard: the hero header
 * (range pills), four summary stat cards, the daily-activity graph, the Top
 * Tracks / Top Artists panels, and a Recent Plays list. It reads everything from
 * one React Query (`historyKeys.data('all')` — "all" is the default range), so
 * stories pre-seed a client with `HistoryData` to render the loaded dashboard or
 * its per-section empty states deterministically without IPC. In the browser run
 * the query is disabled (`IS_ELECTRON === false`); the seeded cache supplies the
 * data the disabled query reads.
 */
const meta: Meta<typeof HistoryView> = {
  title: 'history/HistoryView',
  component: HistoryView,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // dashboard layers many sub-opacity muted tokens (stat hints, captions, row
  // subtitles, graph labels at `/55`–`/75`) over translucent glass panels, so
  // axe's color-contrast ratio is non-deterministic against the layered
  // background. The real headings (h1 hero + h2 section titles) and seeded
  // content are asserted in `play`; the leaf rows carry the same documented
  // deferral in their own stories.
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

/** Loaded dashboard — hero, stat cards, activity graph, and populated panels. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Hero headline (h1) — once it's mounted the loaded dashboard has rendered.
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'A running picture of what you actually stick with.',
      })
    ).toBeInTheDocument();

    // Every section panel exposes a real <h2>.
    await expect(canvas.getByRole('heading', { level: 2, name: 'Activity' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { level: 2, name: 'Top Tracks' })).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Top Artists' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Recent Plays' })
    ).toBeInTheDocument();

    // The "Logged Plays" stat card surfaces the seeded total (248).
    await expect(canvas.getByText('Logged Plays')).toBeInTheDocument();
    await expect(canvas.getByText('248')).toBeInTheDocument();

    // The activity graph renders as a single summarizing role="img".
    await expect(
      canvas.getByRole('img', { name: /^Listening activity: \d+ plays over \d+ days$/ })
    ).toBeInTheDocument();

    // Seeded top track + recent entry both render as play buttons.
    await expect(
      canvas.getByRole('button', { name: /Midnight study session/ })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Slow morning coffee/ })).toBeInTheDocument();
  },
};

/** No data for the range — every section falls back to its empty state. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The hero still renders; the section bodies swap to their empty states.
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: 'A running picture of what you actually stick with.',
      })
    ).toBeInTheDocument();

    await expect(canvas.getByText('No activity yet')).toBeInTheDocument();
    await expect(canvas.getByText('No top tracks in this range')).toBeInTheDocument();
    await expect(canvas.getByText('No artist trends yet')).toBeInTheDocument();
    await expect(canvas.getByText('No recent plays in this range')).toBeInTheDocument();
  },
};
