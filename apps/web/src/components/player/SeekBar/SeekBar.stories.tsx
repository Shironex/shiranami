import type { Meta, StoryObj } from '@storybook/react-vite';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';

import { SeekBar } from './index';

/** Seed the playback position the bar paints from (no live audio engine). */
function seedSeek(currentTime: number, duration: number, scrubTime: number | null): void {
  usePlaybackStore.setState({ currentTime, duration, isPlaying: false });
  usePlayerUIStore.setState({ scrubTime });
}

const meta: Meta<typeof SeekBar> = {
  title: 'player/SeekBar',
  component: SeekBar,
  decorators: [
    Story => (
      <div className="w-80 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SeekBar>;

export const Midway: Story = {
  decorators: [
    Story => {
      seedSeek(108, 215, null);
      return <Story />;
    },
  ],
};

export const Start: Story = {
  decorators: [
    Story => {
      seedSeek(0, 215, null);
      return <Story />;
    },
  ],
};

export const Scrubbing: Story = {
  decorators: [
    Story => {
      seedSeek(108, 215, 60);
      return <Story />;
    },
  ],
};
