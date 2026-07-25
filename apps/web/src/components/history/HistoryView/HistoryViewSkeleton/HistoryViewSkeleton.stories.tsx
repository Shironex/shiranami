import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import HistoryViewSkeleton from './HistoryViewSkeleton';

/**
 * history · HistoryViewSkeleton. The loading state HistoryView renders while its
 * query is in flight: a hero block with three range pills, the four-card summary
 * strip, the activity-graph panel, the two side-by-side list panels (four rows
 * each) and the six-row recent-plays panel — every block on the same grid and at
 * the same size as the loaded dashboard, inside an `aria-busy` container and
 * deliberately free of copy, so the page does not reflow or flash text when the
 * history arrives.
 *
 * Non-interactive by design, so there is nothing to drive: it has exactly one
 * appearance, and the single story asserts that structure rather than padding
 * out variants that do not exist.
 */
const meta: Meta<typeof HistoryViewSkeleton> = {
  title: 'history/HistoryViewSkeleton',
  component: HistoryViewSkeleton,
  parameters: {
    // Pulsing <div>s inside an aria-busy container — no roles, names, or text
    // reach the a11y tree, so axe passes clean even though the loaded dashboard
    // defers on color-contrast.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-full max-w-[72rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryViewSkeleton>;

/** Hero, stat strip, activity panel, both list panels, recent plays — no copy. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('.rounded-full')).toHaveLength(3);
    await expect(canvasElement.querySelector('.md\\:grid-cols-4')?.children).toHaveLength(4);
    await expect(canvasElement.querySelectorAll('.rounded-\\[24px\\]')).toHaveLength(4);
    await expect(canvasElement.querySelectorAll('.border-border\\/20')).toHaveLength(14);
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(65);
    await expect(canvasElement.textContent).toBe('');
  },
};
