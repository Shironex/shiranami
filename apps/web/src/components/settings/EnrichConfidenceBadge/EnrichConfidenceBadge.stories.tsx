import type { Meta, StoryObj } from '@storybook/react-vite';

import EnrichConfidenceBadge from './EnrichConfidenceBadge';

const meta: Meta<typeof EnrichConfidenceBadge> = {
  title: 'settings/EnrichConfidenceBadge',
  component: EnrichConfidenceBadge,
  decorators: [
    Story => (
      <div className="flex items-center gap-2 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { confidence: 0.92 },
};

export const Medium: Story = {
  args: { confidence: 0.6 },
};

export const Low: Story = {
  args: { confidence: 0.3 },
};

export const NoScore: Story = {
  args: { confidence: null },
};
