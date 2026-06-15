import type { Meta, StoryObj } from '@storybook/react-vite';

import DiscordPreview from './DiscordPreview';

const meta: Meta<typeof DiscordPreview> = {
  title: 'settings/DiscordPreview',
  component: DiscordPreview,
  decorators: [
    Story => (
      <div className="max-w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiscordPreview>;

export const Default: Story = {
  args: {
    details: 'Midnight Tapes',
    state: 'Idealism',
    showTimestamp: true,
    showLargeImage: true,
    showButton: true,
  },
};

export const Minimal: Story = {
  args: {
    details: 'Midnight Tapes',
    state: '',
    showTimestamp: false,
    showLargeImage: false,
    showButton: false,
  },
};
