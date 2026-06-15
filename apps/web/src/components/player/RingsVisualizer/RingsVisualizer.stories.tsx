import type { Meta, StoryObj } from '@storybook/react-vite';

import RingsVisualizer from './RingsVisualizer';

const meta: Meta<typeof RingsVisualizer> = {
  title: 'player/RingsVisualizer',
  component: RingsVisualizer,
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RingsVisualizer>;

export const Default: Story = {
  render: () => <RingsVisualizer active />,
};
