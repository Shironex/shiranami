import type { Meta, StoryObj } from '@storybook/react-vite';

import InterfaceSection from './InterfaceSection';

const meta: Meta<typeof InterfaceSection> = {
  title: 'settings/InterfaceSection',
  component: InterfaceSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof InterfaceSection>;

export const Default: Story = {};
