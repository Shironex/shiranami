import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import OverviewViewSkeleton from './OverviewViewSkeleton';

/**
 * overview · OverviewViewSkeleton. The loading frame held until the Overview's
 * stats query settles and the library finishes loading. It reserves the exact
 * blocks of the loaded dashboard — greeting hero, four stat tiles, the
 * wide-panel + stacked-side-column row, and the recommendations shelf with its
 * four library and four discover rows — so nothing shifts when the data lands.
 * It takes no props and has no interactive surface, so the stories carry no
 * interaction `play`; they pin the assistive-tech contract (`aria-busy` plus
 * `aria-hidden`, and zero readable copy) and the block counts at a desktop and a
 * phone-width column instead.
 */
const meta: Meta<typeof OverviewViewSkeleton> = {
  title: 'overview/OverviewViewSkeleton',
  component: OverviewViewSkeleton,
  parameters: {
    // The frame is aria-hidden with no focusable descendants and holds only
    // inert placeholder divs — there is nothing for axe to flag.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof OverviewViewSkeleton>;

/** Desktop width — the full dashboard frame every block of the loaded view occupies. */
export const Default: Story = {
  decorators: [
    Story => (
      <div className="flex h-[48rem] w-[64rem] flex-col overflow-y-auto">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('[aria-busy="true"]');
    await expect(frame).not.toBeNull();
    // Hidden from assistive tech: a loading frame has nothing worth announcing.
    await expect(frame).toHaveAttribute('aria-hidden', 'true');
    // Hero, stat strip, two-column row, recommendations shelf.
    await expect(frame?.children).toHaveLength(4);
    const [statGrid, twoColumnRow] = canvasElement.querySelectorAll('.grid');
    await expect(statGrid.children).toHaveLength(4);
    await expect(twoColumnRow.children).toHaveLength(2);
  },
};

/** Phone-width column — the same blocks reflow without losing any placeholder. */
export const Narrow: Story = {
  decorators: [
    Story => (
      <div className="flex h-[48rem] w-[22rem] flex-col overflow-y-auto">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const [, , libraryGrid, discoverGrid] = canvasElement.querySelectorAll('.grid');
    await expect(libraryGrid.children).toHaveLength(4);
    await expect(discoverGrid.children).toHaveLength(4);
    // Every block still shimmers, and none of them carry readable copy.
    await expect(canvasElement.querySelectorAll('.animate-pulse')).toHaveLength(21);
    await expect(canvasElement.textContent).toBe('');
  },
};
