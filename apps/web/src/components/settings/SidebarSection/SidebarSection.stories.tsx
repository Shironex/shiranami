import type { Meta, StoryObj } from '@storybook/react-vite';

import SidebarSection from './SidebarSection';

const meta: Meta<typeof SidebarSection> = {
  title: 'settings/SidebarSection',
  component: SidebarSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidebarSection>;

export const Default: Story = {};
