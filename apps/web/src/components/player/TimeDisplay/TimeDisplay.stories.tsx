import type { Meta, StoryObj } from '@storybook/react-vite';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';

import { TimeDisplay } from './index';

/** Seed the playback/scrub time the readout reflects. */
function seedTime(currentTime: number, scrubTime: number | null): void {
  usePlaybackStore.setState({ currentTime });
  usePlayerUIStore.setState({ scrubTime });
}

const meta: Meta<typeof TimeDisplay> = {
  title: 'player/TimeDisplay',
  component: TimeDisplay,
  decorators: [
    Story => (
      <span className="tabular-nums text-sm text-muted-foreground">
        <Story />
      </span>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TimeDisplay>;

export const Playing: Story = {
  decorators: [
    Story => {
      seedTime(83, null);
      return <Story />;
    },
  ],
};

export const Scrubbing: Story = {
  decorators: [
    Story => {
      seedTime(83, 12);
      return <Story />;
    },
  ],
};
