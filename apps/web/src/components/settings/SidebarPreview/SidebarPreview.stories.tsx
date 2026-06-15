import type { Meta, StoryObj } from '@storybook/react-vite';

import SidebarPreview from './SidebarPreview';

const meta: Meta<typeof SidebarPreview> = {
  title: 'settings/SidebarPreview',
  component: SidebarPreview,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SidebarPreview>;

export const Default: Story = {};
