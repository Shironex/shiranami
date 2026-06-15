import type { Meta, StoryObj } from '@storybook/react-vite';

import DownloadsSection from './DownloadsSection';

const meta: Meta<typeof DownloadsSection> = {
  title: 'settings/downloads/DownloadsSection',
  component: DownloadsSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DownloadsSection>;

export const Default: Story = {};
