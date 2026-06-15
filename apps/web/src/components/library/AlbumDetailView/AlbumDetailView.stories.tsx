import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useViewStore } from '@/stores/useViewStore';
import { albumKeyOf } from '@/lib/albumSort';

import AlbumDetailView from './AlbumDetailView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const album: Track[] = [
  makeTrack({ id: 'a1', title: 'Intro', trackNumber: 1 }),
  makeTrack({ id: 'a2', title: 'Drift', trackNumber: 2 }),
  makeTrack({ id: 'a3', title: 'Afterglow', trackNumber: 3 }),
];

function seedAlbum(tracks: Track[]): void {
  useLibraryStore.setState({ library: tracks });
  useViewStore.setState({ selectedAlbumKey: albumKeyOf(tracks[0]) });
}

/**
 * library · AlbumDetailView. The detail page for a selected album: a header with
 * back / play-all / shuffle actions, the album metadata, and the album's track
 * rows (each a play `<button>` named "title artist"). Multi-disc albums render
 * "Disc N" subheaders. It reads the library + selected album from the stores.
 * Stories seed an album and assert the header actions and the first track row.
 */
const meta: Meta<typeof AlbumDetailView> = {
  title: 'library/AlbumDetailView',
  component: AlbumDetailView,
  parameters: {
    // Back action is an aria-labelled icon button; play-all / shuffle and each
    // track row are text-labelled buttons; cover fallback icons are decorative —
    // axe passes clean.
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

type Story = StoryObj<typeof AlbumDetailView>;

/** A three-track single-disc album — header actions and the first track row. */
export const Default: Story = {
  decorators: [
    Story => {
      seedAlbum(album);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Back to albums' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Play all' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
    // Track rows expose a play button whose name is "title artist".
    await expect(canvas.getByRole('button', { name: /Intro\s+Idealism/ })).toBeInTheDocument();
  },
};

/** A multi-disc album — the "Disc 1" / "Disc 2" subheaders appear. */
export const MultiDisc: Story = {
  decorators: [
    Story => {
      seedAlbum([
        makeTrack({ id: 'd1t1', title: 'Disc one opener', discNumber: 1, trackNumber: 1 }),
        makeTrack({ id: 'd1t2', title: 'Disc one closer', discNumber: 1, trackNumber: 2 }),
        makeTrack({ id: 'd2t1', title: 'Disc two opener', discNumber: 2, trackNumber: 1 }),
      ]);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Disc 1')).toBeInTheDocument();
    await expect(canvas.getByText('Disc 2')).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /Disc two opener\s+Idealism/ })
    ).toBeInTheDocument();
  },
};
