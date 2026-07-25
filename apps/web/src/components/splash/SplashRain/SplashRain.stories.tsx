import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashRain from './SplashRain';

/**
 * splash · SplashRain. The rAF canvas rain layer, sitting above the 白波
 * reflection so the streaks read as running down the inside of the glass. The
 * canvas is sized in device pixels and CSS-scaled to fill the overlay, so it
 * stays sharp on HiDPI displays and is kept in sync by a ResizeObserver. Any of
 * `paused` (error variant), `lowPerformanceMode`, or `reducedMotion` collapses
 * the field to a single frozen frame rather than removing it — the stories
 * cover the live field and each freeze path.
 */
const meta: Meta<typeof SplashRain> = {
  title: 'splash/SplashRain',
  component: SplashRain,
  parameters: {
    // A single aria-hidden <canvas> — it exposes no role, name, or text, so axe
    // passes clean and the check is ratcheted to blocking.
    a11y: { test: 'error' },
  },
  args: { paused: false, lowPerformanceMode: false, reducedMotion: false },
  decorators: [
    Story => (
      <div className="relative h-[36rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Live field — 24 streaks running at 60Hz update / 30Hz redraw. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvasElement.querySelector('canvas');
    if (!surface) throw new Error('rain canvas missing');
    await expect(surface).toHaveAttribute('aria-hidden', 'true');
    // The sizing effect gave the backing store real device-pixel dimensions.
    await expect(surface.width).toBeGreaterThan(0);
    await expect(surface.height).toBeGreaterThan(0);
    // Decorative texture — nothing reaches the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** Error variant — the field freezes on one frame instead of disappearing. */
export const Paused: Story = {
  args: { paused: true },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector('canvas');
    if (!surface) throw new Error('rain canvas missing');
    // Still mounted and still sized — only the rAF loop is withheld.
    await expect(surface.width).toBeGreaterThan(0);
  },
};

/** Reduced motion / low-perf — same single-frame freeze, different trigger. */
export const StaticFrame: Story = {
  args: { lowPerformanceMode: true, reducedMotion: true },
  play: async ({ canvasElement }) => {
    const surface = canvasElement.querySelector('canvas');
    if (!surface) throw new Error('rain canvas missing');
    await expect(surface.width).toBeGreaterThan(0);
  },
};
