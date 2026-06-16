import type { Meta, StoryObj } from '@storybook/react-vite';
import DownloadProgressButton from './DownloadProgressButton';

const meta: Meta<typeof DownloadProgressButton> = {
  title: 'shared/DownloadProgressButton',
  component: DownloadProgressButton,
  args: {
    ariaLabel: 'Download track',
    onDownload: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof DownloadProgressButton>;

export const Idle: Story = {
  args: { status: 'idle' },
};

export const Downloading: Story = {
  args: { status: 'downloading' },
};

export const Done: Story = {
  args: { status: 'done' },
};

export const Errored: Story = {
  args: { status: 'error', ariaLabel: 'Retry download', title: 'yt-dlp exited with code 1' },
};
