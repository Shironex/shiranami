import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashSteam from './SplashSteam';

// These stories run in real Chromium, whose CSSOM re-serializes the `animation`
// shorthand into longhand order — so assert the longhands, not the raw string.

/**
 * splash · SplashSteam. Three stroke-dash wisps rising over the coffee cup on a
 * 3.6s loop, staggered by 0.8s so they never move in lockstep and fading back
 * via opacity for depth. Steam has no meaningful static frame, so each path
 * carries `.splash-steam` and the global reduced-motion / low-perf guards hide
 * the column outright; the `reducedMotion` prop additionally strips the inline
 * loop. Decorative and non-interactive — the stories cover the animated and
 * degraded states.
 */
const meta: Meta<typeof SplashSteam> = {
  title: 'splash/SplashSteam',
  component: SplashSteam,
  parameters: {
    // An aria-hidden SVG of three unlabelled paths — nothing reaches the a11y
    // tree, so axe passes clean and the check is ratcheted to blocking.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative h-[20rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Animated — three wisps rising on staggered 3.6s loops. */
export const Default: Story = {
  args: { reducedMotion: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wisps = Array.from(canvasElement.querySelectorAll<SVGPathElement>('path.splash-steam'));
    await expect(wisps).toHaveLength(3);
    await expect(wisps.map(wisp => wisp.style.animationName)).toEqual([
      'steam-rise',
      'steam-rise',
      'steam-rise',
    ]);
    // Staggered so the three never rise in lockstep.
    await expect(wisps.map(wisp => wisp.style.animationDelay)).toEqual(['0s', '0.8s', '1.6s']);
    // Purely decorative — the column exposes no role.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** Reduced motion — the inline loops are stripped; the CSS guard hides the rest. */
export const ReducedMotion: Story = {
  args: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    const wisps = Array.from(canvasElement.querySelectorAll<SVGPathElement>('path.splash-steam'));
    await expect(wisps).toHaveLength(3);
    await expect(wisps.map(wisp => wisp.style.animationName)).toEqual(['', '', '']);
  },
};
