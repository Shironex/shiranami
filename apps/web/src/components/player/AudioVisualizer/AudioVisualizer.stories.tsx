import type { Meta, StoryObj } from '@storybook/react-vite';

import AudioVisualizer from './AudioVisualizer';

const meta: Meta<typeof AudioVisualizer> = {
  title: 'player/AudioVisualizer',
  component: AudioVisualizer,
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AudioVisualizer>;

export const Default: Story = {
  render: () => <AudioVisualizer active />,
};
