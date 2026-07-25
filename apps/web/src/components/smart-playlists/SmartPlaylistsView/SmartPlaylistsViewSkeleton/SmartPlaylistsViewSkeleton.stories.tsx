import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SmartPlaylistsViewSkeleton from './SmartPlaylistsViewSkeleton';

/**
 * smart-playlists · SmartPlaylistsViewSkeleton. The loading frame held until the
 * smart-playlists list query settles: the real section header, a placeholder for
 * the "New Smart Playlist" button, and six shimmering card placeholders laid out
 * on the same responsive grid as the loaded view, so nothing shifts when the data
 * arrives. It takes no props and has no interactive surface, so the stories carry
 * no interaction `play` — they pin the assistive-tech contract (`aria-busy` plus a
 * `role="status"` title) and the grid's responsive collapse instead.
 */
const meta: Meta<typeof SmartPlaylistsViewSkeleton> = {
  title: 'smart-playlists/SmartPlaylistsViewSkeleton',
  component: SmartPlaylistsViewSkeleton,
  parameters: {
    // The frame is aria-busy with an sr-only status line, the header icon is
    // aria-hidden, and the placeholders are inert divs — axe passes clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof SmartPlaylistsViewSkeleton>;

/** Full-width loading frame — three placeholder columns at desktop width. */
export const Default: Story = {
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[60rem] flex-col">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    // The header is real (not a placeholder), so the title never flashes in.
    await expect(canvas.getByRole('heading', { name: 'Smart Playlists' })).toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('Smart Playlists');
    // Nothing is clickable while loading — the create button is a placeholder.
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** Narrow container — the same six placeholders collapse to a single column. */
export const Narrow: Story = {
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[22rem] flex-col">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const grid = canvasElement.querySelector('.grid');
    await expect(grid).not.toBeNull();
    await expect(grid?.children).toHaveLength(6);
  },
};
