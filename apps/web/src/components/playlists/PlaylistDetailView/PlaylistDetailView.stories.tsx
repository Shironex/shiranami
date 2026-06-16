import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
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

/**
 * playlists · PlaylistDetailView. The full playlist detail page: it composes the
 * detail header (back / play-all / rename / delete) with the reorderable track
 * list. It reads the selected playlist id from the view store and fetches the
 * playlist + tracks via React Query. Stories seed the query client + view store
 * so the page renders without IPC, asserting the header chrome and the track
 * list (or its empty state).
 */
const meta: Meta<typeof PlaylistDetailView> = {
  title: 'playlists/PlaylistDetailView',
  component: PlaylistDetailView,
  parameters: {
    // Back action is an aria-labelled icon button, play-all/name are labelled
    // buttons, and each track row is a labelled button — axe passes clean.
    a11y: { test: 'error' },
  },
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

/** A playlist with three tracks — header chrome and a rendered track row. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Back to playlists' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Late-night focus' })).toBeInTheDocument();
    await expect(canvas.getByText('3 tracks · 10:45')).toBeInTheDocument();
    // The virtualized track list mounts rows after measuring — wait for the first.
    // Each row's dnd-kit sortable wrapper is also a `role="button"` echoing the
    // row text, so two elements match the name; target the real play <button>.
    const rowMatches = await canvas.findAllByRole('button', {
      name: /Midnight study session\s+Lofi Girl/,
    });
    await expect(rowMatches.find(el => el.tagName === 'BUTTON')).toBeInTheDocument();
  },
};

/** An empty playlist — the header still renders and the list shows its empty state. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Fresh start' })).toBeInTheDocument();
    await expect(canvas.getByText('0 tracks')).toBeInTheDocument();
    await expect(canvas.getByText('No tracks yet')).toBeInTheDocument();
  },
};
