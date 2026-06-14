import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof AlbumGrid> = {
  title: 'library/AlbumGrid',
  component: AlbumGrid,
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

export const Default: Story = {};

export const Filtered: Story = {
  args: {
    searchQuery: 'rainy',
  },
};

export const NoMatches: Story = {
  args: {
    searchQuery: 'zzz-no-such-album',
  },
};
