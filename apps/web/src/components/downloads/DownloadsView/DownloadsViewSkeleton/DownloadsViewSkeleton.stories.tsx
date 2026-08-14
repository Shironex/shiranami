import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import DownloadsViewSkeleton from './DownloadsViewSkeleton';

/**
 * downloads · DownloadsViewSkeleton. The loading state DownloadsView renders
 * before the first main-process queue snapshot lands: two pulsing section
 * groups on the same grid as `DownloadQueueRow` — heading bar, then rows of
 * artwork square, title bar, status bar and status-button square — inside an
 * `aria-busy` container, so a restored queue doesn't reflow once it hydrates.
 *
 * Non-interactive by design, so there is nothing to drive: it has exactly one
 * appearance, and the single story asserts that structure rather than padding
 * out variants that do not exist.
 */
const meta: Meta<typeof DownloadsViewSkeleton> = {
  title: 'downloads/DownloadsViewSkeleton',
  component: DownloadsViewSkeleton,
  parameters: {
    // Pulsing <div>s inside an aria-busy container — no roles, names, or text
    // reach the a11y tree, so axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DownloadsViewSkeleton>;

/** Two aria-busy placeholder section groups, five rows total, and no copy. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('.rounded-xl')).toHaveLength(5);
    await expect(canvasElement.textContent).toBe('');
  },
};
