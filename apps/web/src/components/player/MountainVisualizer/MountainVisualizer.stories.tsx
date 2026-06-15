import type { Meta, StoryObj } from '@storybook/react-vite';

import MountainVisualizer from './MountainVisualizer';

const meta: Meta<typeof MountainVisualizer> = {
  title: 'player/MountainVisualizer',
  component: MountainVisualizer,
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MountainVisualizer>;

export const Default: Story = {
  render: () => <MountainVisualizer active />,
};
