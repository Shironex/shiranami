import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import TrackRowContent from './TrackRowContent';

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

const meta: Meta<typeof TrackRowContent> = {
  title: 'shared/TrackRowContent',
  component: TrackRowContent,
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    track,
    index: 0,
    queue: [track],
    currentTrack: null,
    isPlaying: false,
    handlePlayTrack: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof TrackRowContent>;

export const Default: Story = {};

export const NowPlaying: Story = {
  args: {
    currentTrack: track,
    isPlaying: true,
  },
};
