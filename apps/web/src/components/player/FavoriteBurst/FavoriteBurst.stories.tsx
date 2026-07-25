import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { Heart } from 'lucide-react';

import FavoriteBurst from './FavoriteBurst';

/**
 * player · FavoriteBurst. The expanding ring that plays once when a track is
 * freshly favorited, shared by the player bar and the compact favorite button.
 * It has no interactive surface — it is an `aria-hidden` decorative flourish
 * that fills its `relative` host and animates from `scale 0.5 / opacity 0.6` to
 * `scale 1.9 / opacity 0`, so there is nothing for a play function to drive.
 * The stories show its two real hosts (inside the heart button and on a bare
 * circular surface) and assert the decorative contract: the ring never reaches
 * the accessibility tree and never steals the host button's name or its clicks.
 * Bumping the `burstKey` arg remounts the ring, which is how the app replays it.
 */
const meta: Meta<typeof FavoriteBurst> = {
  title: 'player/FavoriteBurst',
  component: FavoriteBurst,
  args: { burstKey: 1 },
  parameters: {
    layout: 'centered',
    // The ring is aria-hidden and pointer-events-none; the host button in the
    // first story carries the label — axe has nothing to flag.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof FavoriteBurst>;

/** In context — the ring inside a favorited heart button, its real host. */
export const InHeartButton: Story = {
  decorators: [
    Story => (
      <button
        type="button"
        className="relative inline-flex size-8 items-center justify-center rounded-lg text-favorite"
        aria-label="Remove from favorites"
      >
        <Story />
        <Heart className="size-4 fill-current" />
      </button>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The ring is decorative: the heart button keeps its own accessible name,
    // and the ring (a span — the Heart glyph is an svg) stays out of the a11y
    // tree and out of the button's hit testing.
    const button = await canvas.findByRole('button', { name: 'Remove from favorites' });
    const ring = button.querySelector('span[aria-hidden="true"]');
    await expect(ring).not.toBeNull();
    await expect(ring?.className).toContain('pointer-events-none');
  },
};

/** Standalone — the ring's geometry on a bare circular surface. */
export const Standalone: Story = {
  decorators: [
    Story => (
      <div className="relative size-12 rounded-full border border-border/40 bg-card">
        <Story />
      </div>
    ),
  ],
};
