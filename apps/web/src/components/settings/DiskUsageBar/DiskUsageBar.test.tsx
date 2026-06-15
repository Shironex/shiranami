import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VolumeUsage } from '@shiranami/contracts';

import DiskUsageBar from './DiskUsageBar';

const GB = 1024 ** 3;

function makeVolume(overrides: Partial<VolumeUsage> = {}): VolumeUsage {
  return {
    volumeKey: 'vol-1',
    mountLabel: 'Macintosh HD',
    folderPaths: ['/Users/me/Music'],
    musicBytes: 120 * GB,
    totalBytes: 500 * GB,
    freeBytes: 180 * GB,
    usedBytes: 320 * GB,
    unavailable: false,
    ...overrides,
  };
}

describe('DiskUsageBar', () => {
  it('renders the segmented bar with a music/other/free legend', () => {
    render(<DiskUsageBar volume={makeVolume()} />);

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
  });
});
