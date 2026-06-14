import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SmartPlaylist } from '@shiranami/contracts';
import { useViewStore } from '@/stores/useViewStore';
import { smartPlaylistKeys } from '@/hooks/queries/useSmartPlaylists';

import SmartPlaylistsView from './SmartPlaylistsView';

function makePlaylist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: 'sp-1',
    name: 'Late-night focus',
    description: null,
    matchType: 'all',
    rules: [{ field: 'genre', operator: 'is', value: 'lofi' }],
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

/** A client pre-seeded with the smart-playlists list so the grid renders without IPC. */
function seededClient(playlists: SmartPlaylist[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(smartPlaylistKeys.all, playlists);
  return client;
}

const meta: Meta<typeof SmartPlaylistsView> = {
  title: 'smart-playlists/SmartPlaylistsView',
  component: SmartPlaylistsView,
  decorators: [
    Story => (
      <div className="flex h-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SmartPlaylistsView>;

export const Default: Story = {
  decorators: [
    Story => {
      useViewStore.getState().selectSmartPlaylist(null);
      const client = seededClient([
        makePlaylist({ id: 'a', name: 'Late-night focus' }),
        makePlaylist({ id: 'b', name: 'Rainy day cafe' }),
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
      useViewStore.getState().selectSmartPlaylist(null);
      const client = seededClient([]);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};
