import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListeningAlbumStat } from '@/types/electron';

import TopAlbums from './TopAlbums';

const albums: ListeningAlbumStat[] = [
  { album: 'Midnight Tapes', artist: 'Idealism', albumArt: null, playCount: 24 },
  { album: 'Rainy Days', artist: 'Kupla', albumArt: null, playCount: 16 },
  { album: 'Slow Mornings', artist: 'Aso', albumArt: null, playCount: 9 },
];

const meta: Meta<typeof TopAlbums> = {
  title: 'overview/TopAlbums',
  component: TopAlbums,
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

export const Default: Story = {
  args: { albums },
};

export const Empty: Story = {
  args: { albums: [] },
};
