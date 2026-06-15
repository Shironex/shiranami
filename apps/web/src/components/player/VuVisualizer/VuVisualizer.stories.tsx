import type { Meta, StoryObj } from '@storybook/react-vite';

import VuVisualizer from './VuVisualizer';

const meta: Meta<typeof VuVisualizer> = {
  title: 'player/VuVisualizer',
  component: VuVisualizer,
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VuVisualizer>;

export const Default: Story = {
  render: () => <VuVisualizer active />,
};
