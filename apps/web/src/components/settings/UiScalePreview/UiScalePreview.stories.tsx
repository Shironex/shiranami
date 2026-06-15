import type { Meta, StoryObj } from '@storybook/react-vite';

import UiScalePreview from './UiScalePreview';

const meta: Meta<typeof UiScalePreview> = {
  title: 'settings/UiScalePreview',
  component: UiScalePreview,
  args: { scale: 120 },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof UiScalePreview>;

export const Default: Story = {};

export const Enlarged: Story = {
  args: { scale: 150 },
};
