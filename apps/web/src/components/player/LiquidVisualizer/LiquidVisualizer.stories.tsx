import type { Meta, StoryObj } from '@storybook/react-vite';

import LiquidVisualizer from './LiquidVisualizer';

const meta: Meta<typeof LiquidVisualizer> = {
  title: 'player/LiquidVisualizer',
  component: LiquidVisualizer,
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LiquidVisualizer>;

export const Default: Story = {
  render: () => <LiquidVisualizer active />,
};
