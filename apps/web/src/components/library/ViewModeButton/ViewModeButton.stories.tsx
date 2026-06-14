import type { Meta, StoryObj } from '@storybook/react-vite';
import { LayoutGrid, List } from 'lucide-react';

import ViewModeButton from './ViewModeButton';

const meta: Meta<typeof ViewModeButton> = {
  title: 'library/ViewModeButton',
  component: ViewModeButton,
  args: {
    onClick: () => {},
    label: 'Tracks',
    icon: List,
  },
  decorators: [
    Story => (
      <div className="flex items-center rounded-xl border border-border/50 glass-subtle p-1 gap-0.5">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ViewModeButton>;

export const Default: Story = {
  args: {
    active: true,
    icon: List,
    label: 'Tracks',
  },
};

export const Inactive: Story = {
  args: {
    active: false,
    icon: LayoutGrid,
    label: 'Albums',
  },
};
