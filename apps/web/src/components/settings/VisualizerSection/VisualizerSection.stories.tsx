import type { Meta, StoryObj } from '@storybook/react-vite';
import { useUIStore } from '@/stores/useUIStore';

import VisualizerSection from './VisualizerSection';

const meta: Meta<typeof VisualizerSection> = {
  title: 'settings/VisualizerSection',
  component: VisualizerSection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerSection>;

export const Enabled: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ showVisualizer: true, visualizerStyle: 'bars' });
      return <Story />;
    },
  ],
};

export const Disabled: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ showVisualizer: false });
      return <Story />;
    },
  ],
};
