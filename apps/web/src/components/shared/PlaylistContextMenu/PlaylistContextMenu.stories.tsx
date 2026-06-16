import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Playlist } from '@/types/electron';

import PlaylistContextMenu from './PlaylistContextMenu';

const playlist: Playlist = {
  id: 'p1',
  name: 'Late night',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/**
 * shared · PlaylistContextMenu. The right-click menu for a sidebar playlist:
 * Open / Play / Shuffle, portalled to document.body at the click position and
 * dismissed on outside-click, Escape, or scroll. Play/Shuffle load the
 * playlist's tracks via react-query (IPC no-op in the browser run), so stories
 * wrap it in a QueryClient.
 */
const meta: Meta<typeof PlaylistContextMenu> = {
  title: 'shared/PlaylistContextMenu',
  component: PlaylistContextMenu,
  args: {
    playlist,
    position: { x: 24, y: 24 },
    onClose: () => {},
  },
  decorators: [
    Story => (
      <QueryClientProvider client={client()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistContextMenu>;

export const Default: Story = {};
