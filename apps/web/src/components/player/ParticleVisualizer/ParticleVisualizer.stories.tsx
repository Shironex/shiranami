import type { Meta, StoryObj } from '@storybook/react-vite';

import ParticleVisualizer from './ParticleVisualizer';

const meta: Meta<typeof ParticleVisualizer> = {
  title: 'player/ParticleVisualizer',
  component: ParticleVisualizer,
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ParticleVisualizer>;

export const Default: Story = {
  render: () => <ParticleVisualizer active />,
};
