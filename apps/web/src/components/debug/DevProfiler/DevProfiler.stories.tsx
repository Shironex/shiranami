import type { Meta, StoryObj } from '@storybook/react-vite';

import DevProfiler from './DevProfiler';

const meta: Meta<typeof DevProfiler> = {
  title: 'debug/DevProfiler',
  component: DevProfiler,
  args: {
    id: 'demo',
  },
  decorators: [
    Story => (
      <div className="rounded-xl border border-border/40 p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DevProfiler>;

export const Default: Story = {
  args: {
    children: (
      <p className="text-sm text-muted-foreground">
        Profiled subtree — render cost is recorded in dev builds.
      </p>
    ),
  },
};
