import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';

import { WaveformSeekbar } from './index';

function makeTrack(): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
  };
}

/** Seed the playback position the waveform paints from (peaks fall back to a
 *  flat bar without the native bridge). */
function seedWaveform(currentTime: number): void {
  usePlaybackStore.setState({
    currentTrack: makeTrack(),
    currentTime,
    duration: 215,
    isPlaying: false,
  });
  usePlayerUIStore.setState({ scrubTime: null });
}

const meta: Meta<typeof WaveformSeekbar> = {
  title: 'player/WaveformSeekbar',
  component: WaveformSeekbar,
  decorators: [
    Story => (
      <div className="w-96 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WaveformSeekbar>;

export const Compact: Story = {
  decorators: [
    Story => {
      seedWaveform(90);
      return <Story />;
    },
  ],
};

export const Tall: Story = {
  args: { canvasClassName: 'h-16' },
  decorators: [
    Story => {
      seedWaveform(90);
      return <Story />;
    },
  ],
};
