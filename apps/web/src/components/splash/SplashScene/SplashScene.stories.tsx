import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashScene from './SplashScene';

/**
 * splash · SplashScene. The decorative night-scene base behind the wet glass: a
 * violet sky-glow gradient, an SVG skyline silhouette, a warm moon, and ~15
 * distant window lights that flicker. The `reducedMotion` prop (and the global
 * reduced-motion / low-perf guards) freezes the lights at their base opacity by
 * dropping the inline animation. The whole layer is wrapped in `aria-hidden`, so
 * it exposes no roles or text.
 */
const meta: Meta<typeof SplashScene> = {
  title: 'splash/SplashScene',
  component: SplashScene,
  parameters: {
    // Decorative aria-hidden art (gradients + SVG skyline + light dots) with no
    // roles, names, or text — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative h-[36rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SplashScene>;

/** Animated — the full set of flickering window lights renders. */
export const Default: Story = {
  args: {
    reducedMotion: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('.splash-light')).toHaveLength(15);
    // The night scene is decorative and leaks no role into the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** Reduced motion — the lights render but their flicker animation is dropped. */
export const ReducedMotion: Story = {
  args: {
    reducedMotion: true,
  },
  play: async ({ canvasElement }) => {
    const lights = canvasElement.querySelectorAll<HTMLElement>('.splash-light');
    await expect(lights).toHaveLength(15);
    // None of the dots carry an inline flicker animation under reduced motion.
    const animated = Array.from(lights).filter(light => light.style.animation !== '');
    await expect(animated).toHaveLength(0);
  },
};
