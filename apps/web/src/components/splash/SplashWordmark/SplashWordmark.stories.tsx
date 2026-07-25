import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashWordmark from './SplashWordmark';

// These stories run in real Chromium, whose CSSOM re-serializes the `animation`
// shorthand into longhand order — so assert the longhands, not the raw string.

/**
 * splash · SplashWordmark. The big off-center 白波 reflection cast across the
 * wet pane — `--foreground` at 7% alpha, rotated -2deg, sitting behind the rain
 * and droplets so the streaks run in front of it. Non-interactive: the only
 * state it has is its entrance, which the two stories cover — the blur-to-
 * clarity etch, and the opacity-only fade under reduced motion.
 */
const meta: Meta<typeof SplashWordmark> = {
  title: 'splash/SplashWordmark',
  component: SplashWordmark,
  // a11y stays at the global 'todo' default. The reflection is a 7%-alpha
  // decorative glyph, so axe's color-contrast rule cannot pass on it, and the
  // romanized `aria-label` sits on a role-less <span> (aria-prohibited-attr).
  // Both are properties of the shipped mark, not of this story — changing
  // either would alter the boot scene, so axe is left non-blocking here and the
  // label is asserted in `play` instead.
  parameters: { a11y: { test: 'todo' } },
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

/** Default entrance — blur 4px -> 0 over 600ms, condensation wiping clear. */
export const Default: Story = {
  args: { reducedMotion: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wordmark = canvas.getByLabelText('白波 Shiranami');
    await expect(wordmark).toHaveTextContent('白波');
    await expect(wordmark.style.animationName).toBe('shiranami-wordmark-etch');
    await expect(wordmark.style.animationDuration).toBe('600ms');
    await expect(wordmark.style.animationDelay).toBe('220ms');
  },
};

/** Reduced motion — the blur step is dropped; it fades opacity-only. */
export const ReducedMotion: Story = {
  args: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wordmark = canvas.getByLabelText('白波 Shiranami');
    await expect(wordmark.style.animationName).toBe('shiranami-wordmark-fade');
    await expect(wordmark.style.animationDuration).toBe('300ms');
    // The 220ms delay is preserved so it still lands with the rest of the scene.
    await expect(wordmark.style.animationDelay).toBe('220ms');
  },
};
