import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashGlass from './SplashGlass';

/**
 * splash · SplashGlass. The decorative wet-pane layer between the viewer and the
 * night scene: a condensation-film haze + edge vignette (carrying the
 * `.splash-glass-blur` class, dropped under low-perf) and a single faint texture
 * mullion. All derived from `--foreground`, wrapped in an `aria-hidden`
 * container, so it adds glass texture without exposing any roles or text.
 */
const meta: Meta<typeof SplashGlass> = {
  title: 'splash/SplashGlass',
  component: SplashGlass,
  parameters: {
    // Pure aria-hidden CSS decoration — no roles, names, or text reach the a11y
    // tree, so axe passes clean.
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

type Story = StoryObj<typeof SplashGlass>;

/** The aria-hidden glass texture renders its blur layer and stays role-free. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The decorative root is hidden from assistive tech...
    const root = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(root).not.toBeNull();
    // ...and the blur film layer is present.
    await expect(canvasElement.querySelector('.splash-glass-blur')).not.toBeNull();
    // No interactive role or image leaks out of the decoration.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
