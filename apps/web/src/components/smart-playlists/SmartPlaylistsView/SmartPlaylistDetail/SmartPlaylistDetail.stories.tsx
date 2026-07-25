import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import type { SmartPlaylist } from '@shiranami/contracts';
import type { Track } from '@/stores/types';
import { useViewStore } from '@/stores/useViewStore';
import { smartPlaylistKeys } from '@/hooks/queries/useSmartPlaylists';

import SmartPlaylistDetail from './SmartPlaylistDetail';

const PLAYLIST_ID = 'sp-1';

const playlist: SmartPlaylist = {
  id: PLAYLIST_ID,
  name: 'Late-night focus',
  description: null,
  matchType: 'all',
  rules: [
    { field: 'genre', operator: 'is', value: 'lofi' },
    { field: 'playCount', operator: 'greaterThan', value: '5' },
  ],
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
};

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    albumArt: undefined,
    isFavorite: false,
    ...overrides,
  };
}

const tracks: Track[] = [
  makeTrack({ id: 'a', title: 'Midnight study session', artist: 'Idealism' }),
  makeTrack({ id: 'b', title: 'Rainy day cafe', artist: 'Aso' }),
  makeTrack({ id: 'c', title: 'Slow morning coffee', artist: 'Kupla' }),
];

/**
 * A client pre-seeded with this playlist and its matching tracks so the detail
 * renders without IPC. `staleTime` keeps the seed authoritative — Storybook's
 * `window.electronAPI` proxy is not the real bridge, so a background refetch
 * would only replace good data with noise.
 */
function seededClient(seed: { playlist: SmartPlaylist | null; tracks: Track[] }): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(smartPlaylistKeys.detail(PLAYLIST_ID), seed.playlist);
  client.setQueryData(smartPlaylistKeys.tracks(PLAYLIST_ID), seed.tracks);
  return client;
}

/** Wraps a story in a provider holding the seeded cache, with the playlist selected. */
function withSeed(seed: { playlist: SmartPlaylist | null; tracks: Track[] }): Decorator {
  return function SeededStory(Story) {
    useViewStore.getState().selectSmartPlaylist(PLAYLIST_ID);
    return (
      <QueryClientProvider client={seededClient(seed)}>
        <Story />
      </QueryClientProvider>
    );
  };
}

/**
 * smart-playlists · SmartPlaylistDetail. One smart playlist opened from the grid:
 * a header with back / edit / delete actions, the playlist name over a live
 * "{{count}} matching tracks" line, and the virtualized list of tracks the rules
 * currently match. Delete is a two-step confirm popover anchored under its icon
 * (click-outside dismisses it); edit opens `SmartPlaylistFormDialog` seeded with
 * the playlist. All state lives in `useSmartPlaylistDetail`. Stories seed a query
 * client so each state renders deterministically without IPC.
 */
const meta: Meta<typeof SmartPlaylistDetail> = {
  title: 'smart-playlists/SmartPlaylistDetail',
  component: SmartPlaylistDetail,
  parameters: {
    // Back / edit / delete are labelled IconButtons, the name is a real <h2>,
    // the confirm popover is plain text + named buttons, and the track rows
    // carry their own labels — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    id: PLAYLIST_ID,
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

type Story = StoryObj<typeof SmartPlaylistDetail>;

/** Three matching tracks — header, match count, and the virtualized list. */
export const Default: Story = {
  decorators: [withSeed({ playlist, tracks })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Late-night focus' })).toBeInTheDocument();
    await expect(canvas.getByText('3 matching tracks')).toBeInTheDocument();
    // The list virtualizes once measured, so wait for the first row to mount.
    await expect(await canvas.findByText('Midnight study session')).toBeInTheDocument();
  },
};

/** Deleting is a two-step confirm — opening it and cancelling leaves the view intact. */
export const DeleteConfirmation: Story = {
  decorators: [withSeed({ playlist, tracks })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));

    const prompt = await canvas.findByText('Delete this smart playlist?');
    const popover = within(prompt.parentElement as HTMLElement);
    await expect(popover.getByRole('button', { name: 'Delete' })).toBeEnabled();

    // Cancelling closes the popover and leaves the playlist on screen.
    await userEvent.click(popover.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(canvas.queryByText('Delete this smart playlist?')).not.toBeInTheDocument()
    );
    await expect(canvas.getByRole('heading', { name: 'Late-night focus' })).toBeInTheDocument();
  },
};

/** The rules match nothing right now — empty state in place of the list. */
export const NoMatches: Story = {
  decorators: [withSeed({ playlist, tracks: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0 matching tracks')).toBeInTheDocument();
    await expect(canvas.getByText('No smart playlists yet')).toBeInTheDocument();
    await expect(canvas.queryByText('Midnight study session')).not.toBeInTheDocument();
  },
};

/** The playlist was deleted elsewhere — a not-found message with a way back. */
export const NotFound: Story = {
  decorators: [withSeed({ playlist: null, tracks: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Smart playlist not found.')).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(useViewStore.getState().selectedSmartPlaylistId).toBeNull());
  },
};
