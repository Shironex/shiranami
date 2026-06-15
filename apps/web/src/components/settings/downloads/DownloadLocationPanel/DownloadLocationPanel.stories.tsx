import type { Meta, StoryObj } from '@storybook/react-vite';

import DownloadLocationPanel from './DownloadLocationPanel';

const meta = {
  title: 'settings/downloads/DownloadLocationPanel',
  component: DownloadLocationPanel,
  args: {
    onChange: () => {},
    onReset: () => {},
  },
} satisfies Meta<typeof DownloadLocationPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    pathDisplay: '/Users/me/Music/Downloads',
    isDefault: true,
    updating: false,
  },
};

export const Custom: Story = {
  args: {
    pathDisplay: '/Volumes/External/Lofi',
    isDefault: false,
    updating: false,
  },
};
