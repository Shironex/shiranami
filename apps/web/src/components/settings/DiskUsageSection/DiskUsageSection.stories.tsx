import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
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

/**
 * Seed a QueryClient with both the watched folders and the disk-usage result so
 * the section renders its volume breakdown rather than the loading or empty
 * state. The disk-usage query reads via IPC at runtime; pre-seeding the cache is
 * the browser-safe way to put it in the loaded state.
 */
function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    folderKeys.all,
    PATHS.map((path, i) => ({ id: `f-${i}`, path, lastScannedAt: undefined }))
  );
  client.setQueryData(diskUsageKeys.forPaths([...PATHS].sort()), usage);
  return client;
}

/**
 * settings · DiskUsageSection. Per-volume library disk usage, rendered inside
 * Library settings (Electron-only at the real call site). The usage query is
 * IPC-backed, so the story pre-seeds the QueryClient cache with the folder list
 * and a `DiskUsageResult` to drive the loaded state. With data present it shows
 * the "Disk Usage" card, a "Refresh disk usage" icon button, the volume mount
 * label, and a DiskUsageBar (`role="img"`).
 */
const meta: Meta<typeof DiskUsageSection> = {
  title: 'settings/DiskUsageSection',
  component: DiskUsageSection,
  // Real heading, the refresh icon button carries an aria-label, and the
  // embedded bar is a labelled role="img" — axe clean.
  parameters: { a11y: { test: 'error' } },
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

/** Loaded — the volume breakdown, refresh control, and bar all render. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Disk Usage' })).toBeInTheDocument();
    await expect(canvas.getByText('Macintosh HD')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Refresh disk usage' })).toBeInTheDocument();
    await expect(canvas.getByRole('img')).toBeInTheDocument();
  },
};
