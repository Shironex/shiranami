import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import TrackRow from './TrackRow';

const track: Track = {
  id: 'track-1',
  title: 'Lofi beats to relax and study to',
  artist: 'Chillhop',
  album: 'Essentials',
  duration: 215,
  filePath: '/music/test.mp3',
  albumArt: undefined,
  isFavorite: false,
};

const meta: Meta<typeof TrackRow> = {
  title: 'shared/TrackRow',
  component: TrackRow,
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TrackRow>;

export const Default: Story = {
  args: {
    index: 0,
    style: {},
    ariaAttributes: { 'aria-posinset': 1, 'aria-setsize': 1, role: 'listitem' },
    queue: [track],
    currentTrack: null,
    isPlaying: false,
    handlePlayTrack: () => {},
  },
};
