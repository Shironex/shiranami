import type { Meta, StoryObj } from '@storybook/react-vite';

import EnrichBeforeAfterPreview from './EnrichBeforeAfterPreview';

const meta: Meta<typeof EnrichBeforeAfterPreview> = {
  title: 'settings/EnrichBeforeAfterPreview',
  component: EnrichBeforeAfterPreview,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
