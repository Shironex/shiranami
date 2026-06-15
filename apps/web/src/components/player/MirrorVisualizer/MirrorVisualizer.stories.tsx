import type { Meta, StoryObj } from '@storybook/react-vite';

import MirrorVisualizer from './MirrorVisualizer';

const meta: Meta<typeof MirrorVisualizer> = {
  title: 'player/MirrorVisualizer',
  component: MirrorVisualizer,
  decorators: [
    Story => (
      <div style={{ width: 320, height: 96 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MirrorVisualizer>;

export const Default: Story = {
  render: () => <MirrorVisualizer active />,
};
