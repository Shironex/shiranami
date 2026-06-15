import type { Meta, StoryObj } from '@storybook/react-vite';
import type { VolumeUsage } from '@shiranami/contracts';

import DiskUsageBar from './DiskUsageBar';

const GB = 1024 ** 3;

const volume: VolumeUsage = {
  volumeKey: 'vol-1',
  mountLabel: 'Macintosh HD',
  folderPaths: ['/Users/me/Music'],
  musicBytes: 120 * GB,
  totalBytes: 500 * GB,
  freeBytes: 180 * GB,
  usedBytes: 320 * GB,
  unavailable: false,
};

const meta: Meta<typeof DiskUsageBar> = {
  title: 'settings/DiskUsageBar',
  component: DiskUsageBar,
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiskUsageBar>;

export const Default: Story = {
  args: { volume },
};

export const NearlyFull: Story = {
  args: {
    volume: { ...volume, musicBytes: 380 * GB, freeBytes: 20 * GB },
  },
};
