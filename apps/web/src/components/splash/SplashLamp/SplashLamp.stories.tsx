import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashLamp from './SplashLamp';

/** The single aria-hidden gradient div the component renders. */
function glowLayer(root: HTMLElement): HTMLElement {
  const glow = root.querySelector<HTMLElement>('[aria-hidden="true"]');
  if (!glow) throw new Error('lamp layer missing');
  return glow;
}

// These stories run in real Chromium, whose CSSOM re-serializes the `animation`
// shorthand into longhand order — so assert the longhands, not the raw string.

/**
 * splash · SplashLamp. The streetlamp two doors down — one localized warm
 * `--favorite` radial in the upper right, breathing on a 9s ease-in-out loop so
 * it reads as a steady bulb modulated by rain rather than a pulse. `disabled`
 * (reduced-motion or low-perf) freezes it to a static wash. The layer is
 * `aria-hidden` and takes no pointer events, so it has no interactive surface —
 * the stories exercise its two real states instead.
 */
const meta: Meta<typeof SplashLamp> = {
  title: 'splash/SplashLamp',
  component: SplashLamp,
  parameters: {
    // A single aria-hidden gradient div — no roles, names, or text reach the
    // a11y tree, so axe passes clean and can be ratcheted to blocking.
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

type Story = StoryObj<typeof meta>;

/** Breathing — the default boot state, glow modulating on its 9s loop. */
export const Default: Story = {
  args: { disabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const glow = glowLayer(canvasElement);
    await expect(glow.style.animationName).toBe('shiranami-lamp-breathe');
    await expect(glow.style.animationDuration).toBe('9s');
    await expect(glow.style.animationIterationCount).toBe('infinite');
    // Decorative only — nothing leaks into the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** Disabled — reduced-motion / low-perf freeze the glow at a static wash. */
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const glow = glowLayer(canvasElement);
    // The gradient still paints; only the loop is dropped.
    await expect(glow.style.animationName).toBe('');
    await expect(glow.style.background).toContain('var(--favorite)');
  },
};
