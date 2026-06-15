import type { Meta, StoryObj } from '@storybook/react-vite';

import AccentPreview from './AccentPreview';

const meta: Meta<typeof AccentPreview> = {
  title: 'settings/AccentPreview',
  component: AccentPreview,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AccentPreview>;

export const Default: Story = {};
