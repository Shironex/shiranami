import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { lyricsKeys, type LyricLine } from '@/hooks/queries/useLyrics';

import LyricsPanel from './LyricsPanel';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 198,
    filePath: '/music/midnight.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const SYNCED: LyricLine[] = [
  { time: 0, text: 'Soft rain against the glass' },
  { time: 5, text: 'A candle burning low' },
  { time: 10, text: 'The night is slowing down' },
];

/**
 * Pre-seed a client with the current track's lyrics so the panel renders its
 * synced lines without IPC (and the query never resolves to `undefined`).
 * Mirrors how SmartPlaylistsView seeds its query client.
 */
function seededClient(synced: LyricLine[] | null, plain: string | null): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(lyricsKeys.track('track-1'), { synced, plain, source: 'test' });
  return client;
}

/**
 * lyrics · LyricsPanel. The now-playing side panel: an uppercase "Lyrics"
 * header (with an optional header action) over the shared `LyricsBody`. Reads
 * the current track from `usePlaybackStore` and the lyrics from React Query —
 * renders nothing when no track is playing. Stories seed a playing track plus a
 * pre-filled query client so the panel renders deterministically without IPC.
 */
const meta: Meta<typeof LyricsPanel> = {
  title: 'lyrics/LyricsPanel',
  component: LyricsPanel,
  parameters: {
    // The panel title is a real <h2> and synced lines are labelled <button>s —
    // axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[32rem] w-[22rem] flex-col">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    usePlaybackStore.setState({ currentTrack: makeTrack() });
  },
};

export default meta;

type Story = StoryObj<typeof LyricsPanel>;

/** Default — the "Lyrics" header over the seeded synced lines. */
export const Default: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient(SYNCED, null)}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Soft rain against the glass' })
    ).toBeInTheDocument();
  },
};

/** With a header action — the optional control rendered at the header's edge. */
export const WithHeaderAction: Story = {
  args: {
    headerAction: (
      <button type="button" className="text-xs text-muted-foreground">
        Flip
      </button>
    ),
  },
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient(SYNCED, null)}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Lyrics' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Flip' })).toBeInTheDocument();
  },
};
