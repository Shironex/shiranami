import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import LibraryViewSkeleton from './LibraryViewSkeleton';

/**
 * library · LibraryViewSkeleton. The loading state LibraryView renders before
 * the track list hydrates: a reserved search bar + view-toggle strip above
 * fourteen pulsing rows on the same 52px grid as `TrackRow` — artwork square,
 * title bar, artist bar, duration bar — all inside an `aria-busy` container and
 * deliberately free of copy, so nothing flashes and the list does not reflow
 * once the library arrives.
 *
 * Non-interactive by design, so there is nothing to drive: it has exactly one
 * appearance, and the single story asserts that structure rather than padding
 * out variants that do not exist.
 */
const meta: Meta<typeof LibraryViewSkeleton> = {
  title: 'library/LibraryViewSkeleton',
  component: LibraryViewSkeleton,
  parameters: {
    // Pulsing <div>s inside an aria-busy container — no roles, names, or text
    // reach the a11y tree, so axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[40rem] w-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LibraryViewSkeleton>;

/** The reserved search strip, fourteen aria-busy rows, and no copy. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('.h-\\[52px\\]')).toHaveLength(14);
    await expect(canvasElement.querySelectorAll('.h-10')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(58);
    await expect(canvasElement.textContent).toBe('');
  },
};
