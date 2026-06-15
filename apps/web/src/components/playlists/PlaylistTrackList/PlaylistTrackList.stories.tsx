import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect, fn } from 'storybook/test';
import type { Track } from '@/stores/types';

import PlaylistTrackList from './PlaylistTrackList';

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

const tracks = [
  makeTrack({ id: 'a', title: 'Midnight study session' }),
  makeTrack({ id: 'b', title: 'Rainy day cafe' }),
  makeTrack({ id: 'c', title: 'Slow morning coffee' }),
];

/**
 * playlists · PlaylistTrackList. The reorderable track list inside a playlist
 * detail page: a `react-window` list of dnd-kit sortable rows, each a play
 * `<button>` (named "title artist") with a drag handle, favorite, add-to-playlist,
 * and remove action. Renders an empty state when there are no tracks. It's a pure
 * props component; stories assert a representative rendered row and the empty
 * state.
 */
const meta: Meta<typeof PlaylistTrackList> = {
  title: 'playlists/PlaylistTrackList',
  component: PlaylistTrackList,
  parameters: {
    // Each row's play button is named by its text, and the drag handle / favorite
    // / add / remove icon buttons all carry aria-labels — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    displayTracks: tracks,
    sortableIds: tracks.map(t => t.id),
    activeTrack: null,
    currentTrack: null,
    isPlaying: false,
    sensors: [],
    onDragStart: fn(),
    onDragEnd: fn(),
    onDragCancel: fn(),
    onPlayTrack: fn(),
    onToggleFavorite: fn(),
    onRemoveTrack: fn(),
  },
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistTrackList>;

/** Three tracks — assert a representative row and its per-row actions. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The virtualized list mounts rows after measuring — wait for the first. Each
    // row's dnd-kit sortable wrapper is also a `role="button"` echoing the row
    // text, so two elements match the name; target the real play <button>.
    const rowMatches = await canvas.findAllByRole('button', {
      name: /Midnight study session\s+Lofi Girl/,
    });
    await expect(rowMatches.find(el => el.tagName === 'BUTTON')).toBeInTheDocument();
    // Each row exposes a labelled drag handle and a remove action.
    await expect(canvas.getAllByRole('button', { name: 'Drag to reorder' }).length).toBeGreaterThan(
      0
    );
    await expect(
      canvas.getAllByRole('button', { name: 'Remove from playlist' }).length
    ).toBeGreaterThan(0);
  },
};

/** No tracks — the empty state. */
export const Empty: Story = {
  args: {
    displayTracks: [],
    sortableIds: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No tracks yet')).toBeInTheDocument();
    await expect(canvas.getByText('Add tracks from your library')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Drag to reorder' })).not.toBeInTheDocument();
  },
};
