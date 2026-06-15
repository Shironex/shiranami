import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
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

/**
 * smart-playlists · SmartPlaylistsView. The overview grid of rule-based
 * playlists: a section header, a "New Smart Playlist" button, and one
 * `SmartPlaylistCard` button per playlist (opening it routes to the detail
 * view). Reads the list via React Query and `useViewStore` for the selected id;
 * shows a skeleton while loading, an error state on failure, and an empty state
 * with a create CTA when there are none. Stories pre-seed a query client so the
 * grid renders deterministically without IPC.
 */
const meta: Meta<typeof SmartPlaylistsView> = {
  title: 'smart-playlists/SmartPlaylistsView',
  component: SmartPlaylistsView,
  parameters: {
    // Section header is a real <h2>, each card + CTA is a labelled <button>, and
    // the card/empty-state icons are aria-hidden — axe passes clean.
    a11y: { test: 'error' },
  },
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

/** Three smart playlists — section header, create button, and the card grid. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Smart Playlists' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'New Smart Playlist' })).toBeInTheDocument();
    // Each playlist is a card button; names sort alphabetically.
    await expect(canvas.getByRole('button', { name: /Late-night focus/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Morning warm-up/ })).toBeInTheDocument();
  },
};

/** No smart playlists — the empty state with a create call-to-action. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No smart playlists yet')).toBeInTheDocument();
    // The empty state surfaces its own create CTA (so does the toolbar) —
    // assert at least one create button is reachable.
    await expect(
      canvas.getAllByRole('button', { name: 'New Smart Playlist' }).length
    ).toBeGreaterThan(0);
  },
};
