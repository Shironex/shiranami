import type { Meta, StoryObj } from '@storybook/react-vite';

import DependencyInstallCard from './DependencyInstallCard';

const meta: Meta<typeof DependencyInstallCard> = {
  title: 'search/DependencyInstallCard',
  component: DependencyInstallCard,
  args: {
    ffmpegInstalled: false,
    installStatus: 'idle',
    installError: null,
    isInstallInProgress: false,
    installProgress: 0,
    installLabel: '',
    onInstall: () => {},
  },
  decorators: [
    Story => (
      <div className="flex h-[32rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DependencyInstallCard>;

export const Default: Story = {};

export const Installing: Story = {
  args: {
    installStatus: 'downloading',
    isInstallInProgress: true,
    installProgress: 55,
    installLabel: 'Downloading yt-dlp',
  },
};

export const Done: Story = {
  args: {
    installStatus: 'done',
  },
};

export const Errored: Story = {
  args: {
    installStatus: 'error',
    installError: 'Network timeout',
  },
};
