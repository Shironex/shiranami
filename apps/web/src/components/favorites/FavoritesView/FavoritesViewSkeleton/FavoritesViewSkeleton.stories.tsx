import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import FavoritesViewSkeleton from './FavoritesViewSkeleton';

/**
 * favorites · FavoritesViewSkeleton. The loading state FavoritesView renders
 * before the library hydrates: ten pulsing rows on the same 52px grid as
 * `TrackRow` — artwork square, title bar, artist bar and duration bar — inside
 * an `aria-busy` container, and deliberately no page header, so nothing flashes
 * and the list does not reflow once the favorites arrive.
 *
 * Non-interactive by design, so there is nothing to drive: it has exactly one
 * appearance, and the single story asserts that structure rather than padding
 * out variants that do not exist.
 */
const meta: Meta<typeof FavoritesViewSkeleton> = {
  title: 'favorites/FavoritesViewSkeleton',
  component: FavoritesViewSkeleton,
  parameters: {
    // Pulsing <div>s inside an aria-busy container — no roles, names, or text
    // reach the a11y tree, so axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[32rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof FavoritesViewSkeleton>;

/** Ten aria-busy placeholder rows, four bars each, and no copy. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('.h-\\[52px\\]')).toHaveLength(10);
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(40);
    await expect(canvasElement.textContent).toBe('');
  },
};
