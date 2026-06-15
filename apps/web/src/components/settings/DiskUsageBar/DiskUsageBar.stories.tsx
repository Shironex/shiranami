import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
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

/**
 * settings · DiskUsageBar. A single-volume segmented bar (music · other-used ·
 * free) with a "X used of Y" caption and a three-entry legend. The bar itself is
 * a `role="img"` whose accessible name spells out the full byte breakdown;
 * segment widths and color swatches are decorative (`aria-hidden`). All figures
 * are derived in the hook from the passed `volume` prop.
 */
const meta: Meta<typeof DiskUsageBar> = {
  title: 'settings/DiskUsageBar',
  component: DiskUsageBar,
  // The bar is a labelled role="img"; decorative segments/swatches are
  // aria-hidden, legend text is plain — axe clean.
  parameters: { a11y: { test: 'error' } },
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

/** Default — the labelled bar renders with a music/other/free legend. */
export const Default: Story = {
  args: { volume },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The bar's accessible name carries the full breakdown.
    const bar = canvas.getByRole('img');
    await expect(bar).toHaveAccessibleName(/of .* total/);

    // The three legend entries render.
    await expect(canvas.getByText('Music')).toBeInTheDocument();
    await expect(canvas.getByText('Other')).toBeInTheDocument();
    await expect(canvas.getByText('Free')).toBeInTheDocument();
  },
};

/** Nearly full — a high music/low free split still renders the same chrome. */
export const NearlyFull: Story = {
  args: {
    // Keep the payload internally consistent: used = total - free, and music
    // stays within used (free 20 + used 480 = total 500; music 380 ≤ used 480).
    volume: { ...volume, musicBytes: 380 * GB, freeBytes: 20 * GB, usedBytes: 480 * GB },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img')).toBeInTheDocument();
    await expect(canvas.getByText('Free')).toBeInTheDocument();
  },
};
