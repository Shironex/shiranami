import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import QueuePanel from './QueuePanel';

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

const queue: Track[] = [
  makeTrack({ id: 'q0', title: 'Current track', artist: 'Idealism' }),
  makeTrack({ id: 'q1', title: 'Up next one', artist: 'Tide' }),
  makeTrack({ id: 'q2', title: 'Up next two', artist: 'Aso' }),
  makeTrack({ id: 'q3', title: 'Up next three', artist: 'Kupla' }),
];

function seedQueue(tracks: Track[], index: number): void {
  usePlaybackStore.setState({
    queue: tracks,
    queueIndex: index,
    currentTrack: tracks[index] ?? null,
    isPlaying: index >= 0,
  });
}

const meta: Meta<typeof QueuePanel> = {
  title: 'player/QueuePanel',
  component: QueuePanel,
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-80 flex-col glass border border-border/30 rounded-2xl overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof QueuePanel>;

export const WithQueue: Story = {
  decorators: [
    Story => {
      seedQueue(queue, 0);
      return <Story />;
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      seedQueue([], -1);
      return <Story />;
    },
  ],
};
