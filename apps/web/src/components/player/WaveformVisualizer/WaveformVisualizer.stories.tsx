import type { Meta, StoryObj } from '@storybook/react-vite';

import WaveformVisualizer from './WaveformVisualizer';

const meta: Meta<typeof WaveformVisualizer> = {
  title: 'player/WaveformVisualizer',
  component: WaveformVisualizer,
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WaveformVisualizer>;

export const Default: Story = {
  render: () => <WaveformVisualizer active />,
};
