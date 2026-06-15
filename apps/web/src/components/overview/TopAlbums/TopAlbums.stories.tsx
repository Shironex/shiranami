import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { ListeningAlbumStat } from '@/types/electron';

import TopAlbums from './TopAlbums';

const albums: ListeningAlbumStat[] = [
  { album: 'Midnight Tapes', artist: 'Idealism', albumArt: null, playCount: 24 },
  { album: 'Rainy Days', artist: 'Kupla', albumArt: null, playCount: 16 },
  { album: 'Slow Mornings', artist: 'Aso', albumArt: null, playCount: 9 },
];

/**
 * overview · TopAlbums. The "Top albums this week" card — a real `<h2>` over a
 * list of albums, each with artist, a play-count bar, and a localized "{n}
 * plays" label. A missing artist falls back to the common "Unknown Artist"
 * string. With no albums the list is replaced by an empty-state line. Stories
 * cover the populated list (heading + per-album labels) and the empty state.
 */
const meta: Meta<typeof TopAlbums> = {
  title: 'overview/TopAlbums',
  component: TopAlbums,
  parameters: {
    // Real heading; rows are plain text in a list, bar fills are decorative —
    // axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TopAlbums>;

/** Three albums — the heading plus each album's name and "{n} plays" label. */
export const Default: Story = {
  args: { albums },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Top albums this week' })).toBeInTheDocument();
    await expect(canvas.getByText('Midnight Tapes')).toBeInTheDocument();
    await expect(canvas.getByText('24 plays')).toBeInTheDocument();
    // Each album is its own list row.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
  },
};

/** No albums — the list is replaced by the empty-state copy. */
export const Empty: Story = {
  args: { albums: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Top albums this week' })).toBeInTheDocument();
    await expect(canvas.getByText(/most-spun albums/)).toBeInTheDocument();
    await expect(canvas.queryByRole('listitem')).not.toBeInTheDocument();
  },
};
