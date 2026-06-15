import type { Meta, StoryObj } from '@storybook/react-vite';

import CircleVisualizer from './CircleVisualizer';

const meta: Meta<typeof CircleVisualizer> = {
  title: 'player/CircleVisualizer',
  component: CircleVisualizer,
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CircleVisualizer>;

export const Default: Story = {
  render: () => <CircleVisualizer active />,
};
