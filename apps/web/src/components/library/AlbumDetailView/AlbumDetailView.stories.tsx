import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof AlbumDetailView> = {
  title: 'library/AlbumDetailView',
  component: AlbumDetailView,
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

export const Default: Story = {
  decorators: [
    Story => {
      seedAlbum(album);
      return <Story />;
    },
  ],
};

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
};
