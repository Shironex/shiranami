import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { VisualizerStyle } from '@/stores/useUIStore';

import VisualizerStyleGrid from './VisualizerStyleGrid';

const meta: Meta<typeof VisualizerStyleGrid> = {
  title: 'settings/VisualizerStyleGrid',
  component: VisualizerStyleGrid,
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerStyleGrid>;

function Interactive(args: { columns?: 2 | 3; compact?: boolean }) {
  const [value, setValue] = useState<VisualizerStyle>('bars');
  return <VisualizerStyleGrid value={value} onSelect={setValue} {...args} />;
}

export const Default: Story = {
  render: () => <Interactive />,
};

export const ThreeColumns: Story = {
  render: () => <Interactive columns={3} />,
};

export const Compact: Story = {
  render: () => <Interactive columns={3} compact />,
};
