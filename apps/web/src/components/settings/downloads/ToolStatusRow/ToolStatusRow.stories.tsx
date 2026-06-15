import type { Meta, StoryObj } from '@storybook/react-vite';

import ToolStatusRow from './ToolStatusRow';

const meta = {
  title: 'settings/downloads/ToolStatusRow',
  component: ToolStatusRow,
} satisfies Meta<typeof ToolStatusRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    installed: true,
    installedTitle: 'yt-dlp installed',
    notInstalledTitle: 'yt-dlp not installed',
    updateAvailable: false,
  },
};

export const UpdateAvailable: Story = {
  args: {
    installed: true,
    installedTitle: 'yt-dlp installed',
    notInstalledTitle: 'yt-dlp not installed',
    updateAvailable: true,
  },
};

export const NotInstalled: Story = {
  args: {
    installed: false,
    installedTitle: 'ffmpeg installed',
    notInstalledTitle: 'ffmpeg not installed',
    updateAvailable: false,
    notInstalledRight: 'Recommended',
  },
};
