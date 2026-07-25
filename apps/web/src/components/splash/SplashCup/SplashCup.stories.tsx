import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashCup from './SplashCup';

/**
 * splash · SplashCup. The foreground cafe-window prop: a static SVG mug on its
 * saucer, bottom-right. Ceramic and rim derive from `--background` / `--primary`
 * while the coffee fill and crema keep a warm brown gradient confined to the
 * SVG as product art. It takes no props and never animates, so there is a
 * single story and no play interaction to drive — only its structure and the
 * perf-gated `.splash-cup-shadow` filter are worth asserting.
 */
const meta: Meta<typeof SplashCup> = {
  title: 'splash/SplashCup',
  component: SplashCup,
  parameters: {
    // Static aria-hidden SVG art with no roles, names, or text — axe passes
    // clean, so the check is ratcheted to blocking.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative h-[16rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** The only state the cup has — static product art with its drop shadow. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cup = canvasElement.querySelector<HTMLElement>('.splash-cup-shadow');
    if (!cup) throw new Error('cup wrapper missing');
    await expect(cup).toHaveAttribute('aria-hidden', 'true');
    await expect(cup.style.filter).toContain('drop-shadow');
    // Both gradients resolve, so the mug and the coffee both paint.
    await expect(canvasElement.querySelector('#splash-cup-body')).not.toBeNull();
    await expect(canvasElement.querySelector('#splash-cup-coffee')).not.toBeNull();
    // Decoration only — no role reaches the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
