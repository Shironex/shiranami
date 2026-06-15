import type { Meta, StoryObj } from '@storybook/react-vite';

import SupportSection from './SupportSection';

const meta: Meta<typeof SupportSection> = {
  title: 'settings/SupportSection',
  component: SupportSection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SupportSection>;

export const Default: Story = {};
