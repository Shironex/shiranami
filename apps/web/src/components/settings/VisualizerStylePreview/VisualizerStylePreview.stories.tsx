import type { Meta, StoryObj } from '@storybook/react-vite';
import { useUIStore } from '@/stores/useUIStore';

import VisualizerStylePreview from './VisualizerStylePreview';

const meta: Meta<typeof VisualizerStylePreview> = {
  title: 'settings/VisualizerStylePreview',
  component: VisualizerStylePreview,
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerStylePreview>;

export const Bars: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ visualizerStyle: 'bars' });
      return <Story />;
    },
  ],
};

export const Waveform: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ visualizerStyle: 'waveform' });
      return <Story />;
    },
  ],
};
