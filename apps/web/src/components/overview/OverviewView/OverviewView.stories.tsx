import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import type { HistoryData } from '@/hooks/queries/useHistory';
import { historyKeys } from '@/hooks/queries/useHistory';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

import OverviewView from './OverviewView';

const library: Track[] = [
  {
    id: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/drift.mp3',
    createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  },
  {
    id: 't2',
    title: 'Afterglow',
    artist: 'Aso',
    album: 'Bloom',
    duration: 198,
    filePath: '/music/afterglow.mp3',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

const historyData: HistoryData = {
  summary: {
    totalPlays: 128,
    totalMinutes: 872,
    uniqueTracks: 64,
    uniqueArtists: 22,
    completedPlays: 110,
    topTracks: [
      {
        trackId: 't1',
        title: 'Drift',
        artist: 'Idealism',
        album: 'Midnight Tapes',
        albumArt: null,
        playCount: 18,
        listenedSeconds: 3800,
        lastPlayedAt: new Date().toISOString(),
      },
    ],
    topArtists: [{ artist: 'Idealism', playCount: 41, listenedSeconds: 9000 }],
  },
  recent: [],
  activity: [],
};

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // hasHistory is derived from the summary's totalPlays, so seeding the 7d
  // history query is enough to flip Overview from the empty section to the full
  // data layout; the hourly/insights/recommendations sub-queries fall back to
  // their defaults.
  client.setQueryData(historyKeys.data('7d'), historyData);
  return client;
}

/**
 * overview · OverviewView. The landing dashboard — the composition root that
 * assembles the greeting hero, stat strip, top-this-week, listening clock, top
 * albums, smart mixes, recommendations, and the recently-added rail, all gated
 * by interface-store toggles (all on by default) and the data branches
 * (loading / error / first-run / populated). The leaf sections are tested in
 * their own stories, so here the populated story asserts the greeting hero plus
 * the section headings, and the first-run story asserts the welcome empty state.
 * The playback + weather stores are seeded to the baseline so the hero is
 * deterministic.
 */
const meta: Meta<typeof OverviewView> = {
  title: 'overview/OverviewView',
  component: OverviewView,
  // a11y stays at the global 'todo' default rather than ratcheting to 'error':
  // this composition root mounts RecommendationsShelf, whose discover section
  // async-swaps in the out-of-scope DependencyInstallCard under the Storybook
  // IPC mock. The leaf overview components are individually ratcheted to 'error'
  // in their own stories; here `play` asserts the composed structure.
  parameters: {},
  decorators: [
    Story => {
      useWeatherStore.setState({ enabled: false, coords: null });
      usePlaybackStore.setState({ currentTrack: null });
      return (
        <QueryClientProvider client={seededClient()}>
          <div className="flex h-[48rem] flex-col">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof OverviewView>;

/** A library with listening history — the hero plus every data section heading. */
export const Populated: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({ library, libraryLoaded: true });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Greeting hero (eyebrow + heading) anchors the top of the dashboard.
    await expect(await canvas.findByText('Your sanctuary')).toBeInTheDocument();
    // The stat strip + week sections render once history exists.
    await expect(canvas.getByText('Listened this week')).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Top this week' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Listening clock' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Top albums this week' })).toBeInTheDocument();
  },
};

/** No library at all — the single welcoming first-run empty state with its CTA. */
export const FirstRun: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({ library: [], libraryLoaded: true });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Your sanctuary starts here')).toBeInTheDocument();
    // The empty state offers a single create CTA; the data sections stay hidden.
    await expect(canvas.getByRole('button', { name: 'Add a music folder' })).toBeInTheDocument();
    await expect(canvas.queryByText('Listened this week')).not.toBeInTheDocument();
  },
};
