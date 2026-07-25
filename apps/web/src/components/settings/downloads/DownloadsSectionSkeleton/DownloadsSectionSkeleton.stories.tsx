import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import DownloadsSectionSkeleton from './DownloadsSectionSkeleton';

/**
 * settings/downloads · DownloadsSectionSkeleton. What the downloads settings
 * card shows while `checkDependencies` resolves: a placeholder tool card for
 * yt-dlp (status row, binary path, installed/latest versions, hint line), the
 * download-location panel with its two action buttons, the section divider, and
 * a second tool card for ffmpeg — laid out on the real card's geometry so the
 * settings page does not reflow when the tool status lands.
 *
 * Non-interactive by design, so there is nothing to drive: it has exactly one
 * appearance, and the single story asserts that structure rather than padding
 * out variants that do not exist.
 */
const meta: Meta<typeof DownloadsSectionSkeleton> = {
  title: 'settings/downloads/DownloadsSectionSkeleton',
  component: DownloadsSectionSkeleton,
  parameters: {
    // Pure pulsing <div>s — no roles, names, or text reach the a11y tree, so axe
    // passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DownloadsSectionSkeleton>;

/** Two tool cards + the location panel: 26 bars, one divider, and no copy. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(26);
    await expect(canvasElement.querySelectorAll('.border-t')).toHaveLength(1);
    await expect(canvasElement.textContent).toBe('');
  },
};
