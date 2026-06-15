import type { Meta, StoryObj } from '@storybook/react-vite';

import ConstellationVisualizer from './ConstellationVisualizer';

const meta: Meta<typeof ConstellationVisualizer> = {
  title: 'player/ConstellationVisualizer',
  component: ConstellationVisualizer,
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ConstellationVisualizer>;

export const Default: Story = {
  render: () => <ConstellationVisualizer active />,
};
