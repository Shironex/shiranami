import type { Meta, StoryObj } from '@storybook/react-vite';

import HistoryEmptyState from './HistoryEmptyState';

const meta: Meta<typeof HistoryEmptyState> = {
  title: 'history/HistoryEmptyState',
  component: HistoryEmptyState,
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryEmptyState>;

export const Default: Story = {
  args: {
    title: 'No top tracks in this range',
    copy: 'Once enough listens are logged in the selected period, your most-played tracks will surface here.',
  },
};
