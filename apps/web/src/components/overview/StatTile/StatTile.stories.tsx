import type { Meta, StoryObj } from '@storybook/react-vite';

import StatTile from './StatTile';

const meta: Meta<typeof StatTile> = {
  title: 'overview/StatTile',
  component: StatTile,
  decorators: [
    Story => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatTile>;

export const Default: Story = {
  args: {
    kanji: '時',
    value: '14h 32m',
    label: 'Listened this week',
  },
};

export const TrendUp: Story = {
  args: {
    kanji: '時',
    value: '14h 32m',
    label: 'Listened this week',
    hint: '+2h 18m vs. last week',
    trend: 'up',
  },
};

export const TrendDown: Story = {
  args: {
    kanji: '時',
    value: '9h 02m',
    label: 'Listened this week',
    hint: '−45m vs. last week',
    trend: 'down',
  },
};
