import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashDroplets from './SplashDroplets';

/**
 * splash · SplashDroplets. A purely decorative glass layer: ~34 static SVG
 * droplet ellipses clinging to the pane plus 5 thin running-water streaks
 * (motion-only, hidden under reduced-motion / low-perf). The whole layer lives
 * inside an `aria-hidden` container and exposes no roles or text, so it carries
 * no accessible information. Stories render it over a dark splash backdrop.
 */
const meta: Meta<typeof SplashDroplets> = {
  title: 'splash/SplashDroplets',
  component: SplashDroplets,
  parameters: {
    // The layer is wrapped in aria-hidden and is pure SVG/CSS decoration — it
    // exposes no roles, names, or text, so axe finds nothing to flag.
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

type Story = StoryObj<typeof SplashDroplets>;

/** Renders the full set of static droplets + streaks, all decorative. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The decoration renders its full droplet/streak set...
    await expect(canvasElement.querySelectorAll('ellipse')).toHaveLength(34);
    await expect(canvasElement.querySelectorAll('.splash-streak')).toHaveLength(5);
    // ...but leaks no role/image into the a11y tree (the layer is aria-hidden).
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
