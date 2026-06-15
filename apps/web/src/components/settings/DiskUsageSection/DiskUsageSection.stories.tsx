import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DiskUsageResult } from '@shiranami/contracts';
import { folderKeys } from '@/hooks/queries/useFolders';
import { diskUsageKeys } from '@/hooks/queries/useDiskUsage';

import DiskUsageSection from './DiskUsageSection';

const GB = 1024 ** 3;
const PATHS = ['/Users/me/Music'];

const usage: DiskUsageResult = {
  volumes: [
    {
      volumeKey: 'vol-1',
      mountLabel: 'Macintosh HD',
      folderPaths: PATHS,
      musicBytes: 120 * GB,
      totalBytes: 500 * GB,
      freeBytes: 180 * GB,
      usedBytes: 320 * GB,
      unavailable: false,
    },
  ],
  computedAt: new Date(0).toISOString(),
};

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    folderKeys.all,
    PATHS.map((path, i) => ({ id: `f-${i}`, path, lastScannedAt: undefined }))
  );
  client.setQueryData(diskUsageKeys.forPaths([...PATHS].sort()), usage);
  return client;
}

const meta: Meta<typeof DiskUsageSection> = {
  title: 'settings/DiskUsageSection',
  component: DiskUsageSection,
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient()}>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiskUsageSection>;

export const Default: Story = {};
