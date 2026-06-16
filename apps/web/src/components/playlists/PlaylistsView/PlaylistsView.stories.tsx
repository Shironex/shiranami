import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect } from 'storybook/test';
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

/**
 * playlists · PlaylistsView. The playlists overview: an `<h1>` title, a "New
 * Playlist" button that reveals an inline create form, and one card `<button>`
 * per playlist (opening it routes to the detail view). It reads the list via
 * React Query; stories pre-seed the query client so the grid renders
 * deterministically without IPC, and drive the create-form reveal.
 */
const meta: Meta<typeof PlaylistsView> = {
  title: 'playlists/PlaylistsView',
  parameters: {
    // Title is a real <h1>, each card + the create CTA are labelled buttons, the
    // create form input is aria-labelled, and the card placeholder icon is a
    // decorative SVG — axe passes clean.
    a11y: { test: 'error' },
  },
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

/** Three playlists — heading, the card grid, and the reveal of the create form. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Your playlists' })).toBeInTheDocument();
    // Each seeded playlist is its own card button (name starts with its title).
    await expect(canvas.getByRole('button', { name: /Late-night focus/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Rainy day cafe/ })).toBeInTheDocument();

    // The "New Playlist" button reveals the inline create form.
    await userEvent.click(canvas.getByRole('button', { name: 'New Playlist' }));
    await expect(
      await canvas.findByRole('textbox', { name: 'Playlist name...' })
    ).toBeInTheDocument();
  },
};

/** No playlists — the empty state and onboarding hint. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No playlists yet')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'New Playlist' })).toBeInTheDocument();
    // No card buttons exist in the empty state.
    await expect(canvas.queryByRole('button', { name: /focus/ })).not.toBeInTheDocument();
  },
};
