import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
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

function renderSection(ui: ReactElement, opts: { seed?: boolean } = {}): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (opts.seed) {
    client.setQueryData(
      folderKeys.all,
      PATHS.map((path, i) => ({ id: `f-${i}`, path, lastScannedAt: undefined }))
    );
    client.setQueryData(diskUsageKeys.forPaths([...PATHS].sort()), usage);
  } else {
    client.setQueryData(folderKeys.all, []);
  }
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('DiskUsageSection', () => {
  it('shows the empty state when no folders are watched', () => {
    renderSection(<DiskUsageSection />);

    expect(screen.getByText('Add a music folder to see disk usage')).toBeInTheDocument();
  });

  it('renders the volume breakdown when usage data is present', () => {
    renderSection(<DiskUsageSection />, { seed: true });

    expect(screen.getByRole('heading', { name: 'Disk Usage' })).toBeInTheDocument();
    expect(screen.getByText('Macintosh HD')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
