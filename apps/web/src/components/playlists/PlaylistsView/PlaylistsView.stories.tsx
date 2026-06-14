import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Playlist } from '@/types/electron';
import { playlistKeys } from '@/hooks/queries/usePlaylists';

import PlaylistsView from './PlaylistsView';

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'pl-1',
    name: 'Late-night focus',
    description: 'Slow beats for deep work',
    coverArt: undefined,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

/** A client pre-seeded with the playlists list so the grid renders without IPC. */
function seededClient(playlists: Playlist[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(playlistKeys.all, playlists);
  return client;
}

const meta: Meta<typeof PlaylistsView> = {
  title: 'playlists/PlaylistsView',
  component: PlaylistsView,
  decorators: [
    Story => (
      <div className="flex h-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistsView>;

export const Default: Story = {
  decorators: [
    Story => {
      const client = seededClient([
        makePlaylist({ id: 'a', name: 'Late-night focus' }),
        makePlaylist({ id: 'b', name: 'Rainy day cafe', description: undefined }),
        makePlaylist({ id: 'c', name: 'Morning warm-up' }),
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
      const client = seededClient([]);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};
