import type { Meta, StoryObj } from '@storybook/react-vite';

import InstallProgressBar from './InstallProgressBar';

const meta = {
  title: 'settings/downloads/InstallProgressBar',
  component: InstallProgressBar,
} satisfies Meta<typeof InstallProgressBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    percent: 42,
    caption: 'Downloading yt-dlp... 42%',
  },
};

export const Complete: Story = {
  args: {
    percent: 100,
    caption: 'Installing... 100%',
  },
};
