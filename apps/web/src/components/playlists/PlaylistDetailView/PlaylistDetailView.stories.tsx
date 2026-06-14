import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Playlist } from '@/types/electron';
import type { Track } from '@/stores/types';
import { useViewStore } from '@/stores/useViewStore';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistDetailView from './PlaylistDetailView';

const PLAYLIST_ID = 'pl-1';

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: PLAYLIST_ID,
    name: 'Late-night focus',
    description: 'Slow beats for deep work',
    coverArt: undefined,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Girl',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

/** A client pre-seeded with a playlist + its tracks so the detail renders without IPC. */
function seededClient(playlist: Playlist, tracks: Track[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(playlistKeys.detail(PLAYLIST_ID), playlist);
  client.setQueryData(playlistKeys.tracks(PLAYLIST_ID), tracks);
  return client;
}

const meta: Meta<typeof PlaylistDetailView> = {
  title: 'playlists/PlaylistDetailView',
  component: PlaylistDetailView,
  decorators: [
    Story => (
      <div className="flex h-[40rem] w-[48rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistDetailView>;

export const Default: Story = {
  decorators: [
    Story => {
      useViewStore.getState().selectPlaylist(PLAYLIST_ID);
      const client = seededClient(makePlaylist(), [
        makeTrack({ id: 'a', title: 'Midnight study session' }),
        makeTrack({ id: 'b', title: 'Rainy day cafe' }),
        makeTrack({ id: 'c', title: 'Slow morning coffee' }),
      ]);
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
      useViewStore.getState().selectPlaylist(PLAYLIST_ID);
      const client = seededClient(makePlaylist({ name: 'Fresh start' }), []);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};
