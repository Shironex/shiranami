import type { Meta, StoryObj } from '@storybook/react-vite';

import CompactSection from './CompactSection';

const meta: Meta<typeof CompactSection> = {
  title: 'settings/CompactSection',
  component: CompactSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompactSection>;

export const Default: Story = {};
