import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import PlaylistsViewSkeleton from './PlaylistsViewSkeleton';

/**
 * playlists · PlaylistsViewSkeleton. The loading frame held until the playlists
 * query settles: a reserved header row (title chip + grid-size toggle chip) and
 * ten shimmering cards laid out on the same responsive grid as the loaded view,
 * each a square cover placeholder above two text lines — so the toolbar and the
 * first card row never shift when the data arrives. It takes no props and has no
 * interactive surface, so the stories carry no interaction `play`; they pin the
 * `aria-busy` contract and the card anatomy at a desktop and a phone-width
 * column instead.
 */
const meta: Meta<typeof PlaylistsViewSkeleton> = {
  title: 'playlists/PlaylistsViewSkeleton',
  component: PlaylistsViewSkeleton,
  parameters: {
    // The frame is aria-busy with no readable copy and no focusable descendants
    // — every placeholder is an inert div — so axe passes clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof PlaylistsViewSkeleton>;

/** Desktop width — the header row plus a full grid of ten card placeholders. */
export const Default: Story = {
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[64rem] flex-col">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('[aria-busy="true"]');
    await expect(frame).not.toBeNull();
    // Header row + grid body — the loaded view's two regions.
    await expect(frame?.children).toHaveLength(2);
    await expect(canvasElement.querySelector('.grid')?.children).toHaveLength(10);
    // Nothing is clickable while loading — the toolbar is placeholders too.
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};

/** Phone-width column — the same ten cards, still two per row, none dropped. */
export const Narrow: Story = {
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[22rem] flex-col">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('.grid')?.children[0];
    // Square cover placeholder above the name + description lines.
    await expect(card?.children).toHaveLength(3);
    await expect(card?.children[0]).toHaveClass('aspect-square');
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(32);
    await expect(canvasElement.textContent).toBe('');
  },
};
