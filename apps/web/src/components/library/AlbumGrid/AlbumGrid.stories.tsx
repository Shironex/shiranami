import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';

import AlbumGrid from './AlbumGrid';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const library: Track[] = [
  makeTrack({ id: 'a1', title: 'Intro', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'a2', title: 'Drift', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'b1', title: 'Cafe', album: 'Rainy Day', artist: 'Aso' }),
  makeTrack({ id: 'b2', title: 'Window', album: 'Rainy Day', artist: 'Aso' }),
  makeTrack({ id: 'c1', title: 'Coffee', album: 'Slow Morning', artist: 'Kupla' }),
];

/**
 * library · AlbumGrid. The virtualized album grid for the library's albums view:
 * tracks are grouped into albums and rendered as `react-window` cells, each a
 * labelled `<button>` (album name + artist + track count) that opens the album.
 * A live filter count appears while searching and a compact empty state shows on
 * no matches. Stories assert a representative rendered card, the filter-count
 * chrome, and the empty state.
 */
const meta: Meta<typeof AlbumGrid> = {
  title: 'library/AlbumGrid',
  component: AlbumGrid,
  parameters: {
    // Each album cell is a labelled <button>, the cover fallback icon is a
    // decorative SVG, and the empty state is plain text — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    library,
    searchQuery: '',
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

type Story = StoryObj<typeof AlbumGrid>;

/** All three albums — assert a representative card button renders. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Grid cells mount only after the container is measured, so wait for the
    // first card; its accessible name is album + artist + track count.
    await expect(await canvas.findByRole('button', { name: /Midnight Tapes/ })).toBeInTheDocument();
  },
};

/** Filtered to "rainy" — the filter-count chrome and the matching album card. */
export const Filtered: Story = {
  args: {
    searchQuery: 'rainy',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('1 of 3 albums')).toBeInTheDocument();
    await expect(await canvas.findByRole('button', { name: /Rainy Day/ })).toBeInTheDocument();
  },
};

/** No matches — the compact empty state. */
export const NoMatches: Story = {
  args: {
    searchQuery: 'zzz-no-such-album',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No matching tracks')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Midnight Tapes/ })).not.toBeInTheDocument();
  },
};
