import type { Meta, StoryObj } from '@storybook/react-vite';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import { VolumeControl } from './index';

/** Seed the playback volume/mute the control reflects. */
function seedVolume(volume: number, isMuted: boolean): void {
  usePlaybackStore.setState({ volume, isMuted });
}

const meta: Meta<typeof VolumeControl> = {
  title: 'player/VolumeControl',
  component: VolumeControl,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VolumeControl>;

export const High: Story = {
  decorators: [
    Story => {
      seedVolume(0.8, false);
      return <Story />;
    },
  ],
};

export const Low: Story = {
  decorators: [
    Story => {
      seedVolume(0.25, false);
      return <Story />;
    },
  ],
};

export const Muted: Story = {
  decorators: [
    Story => {
      seedVolume(0.6, true);
      return <Story />;
    },
  ],
};
