import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HistoryData } from '@/hooks/queries/useHistory';
import { historyKeys } from '@/hooks/queries/useHistory';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';

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
  useLibraryStore.setState({ library, libraryLoaded: true });
  client.setQueryData(historyKeys.data('7d'), historyData);
  return client;
}

const meta: Meta<typeof OverviewView> = {
  title: 'overview/OverviewView',
  component: OverviewView,
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient()}>
        <div className="flex h-[48rem] flex-col">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OverviewView>;

export const Populated: Story = {};

export const FirstRun: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({ library: [], libraryLoaded: true });
      return <Story />;
    },
  ],
};
