import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashBrand from './SplashBrand';

// TypeError, not Error: the `Error` story export below shadows the global
// constructor for the rest of this module.
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new TypeError(`${what} missing`);
  return value;
}

/**
 * splash · SplashBrand. The bottom-left identity block: a pill badge with a
 * pulsing LED, the Instrument Serif "Shiranami" wordmark, the kanji subtitle,
 * and a sweep loader over the rotating boot message. The whole block is a
 * `role="status"` / `aria-live="polite"` region, so the message — and, in the
 * error variant, the failure text plus its retry button — are announced. The
 * stories cover loading, the pre-fade-in state, reduced motion, and both error
 * shapes.
 */
const meta: Meta<typeof SplashBrand> = {
  title: 'splash/SplashBrand',
  component: SplashBrand,
  // a11y stays at the global 'todo' default: the block is 9–10px mono copy in
  // fractional-alpha tokens (`--muted-foreground` at 0.85, `--primary` on a 0.7
  // background) painted for the splash's near-black canvas, so axe's
  // color-contrast rule cannot pass it against a story backdrop. The accessible
  // structure — live region, heading, named retry button — is asserted in `play`
  // instead.
  parameters: { a11y: { test: 'todo' } },
  args: {
    showStatus: true,
    variant: 'loading',
    messageKey: 'loading1',
    reducedMotion: false,
  },
  decorators: [
    Story => (
      <div className="relative h-[24rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Loading — badge, wordmark, sweep loader, and the rotating status message. */
export const Loading: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const block = canvas.getByRole('status');
    await expect(block).toHaveAttribute('aria-live', 'polite');
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Shiranami');
    await expect(canvas.getByText('Tuning the instruments...')).toBeInTheDocument();
    // The sweep bar renders and is animating.
    const sweep = required(canvasElement.querySelector<HTMLElement>('.splash-sweep'), 'sweep');
    // Real Chromium re-serializes the `animation` shorthand, so assert longhands.
    await expect(sweep.style.animationName).toBe('splash-sweep');
    await expect(sweep.style.animationIterationCount).toBe('infinite');
  },
};

/** A later message in the rotation — the copy swaps, the layout does not. */
export const LaterMessage: Story = {
  args: { messageKey: 'loading5' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Finding the perfect beat...')).toBeInTheDocument();
    await expect(canvas.queryByText('Tuning the instruments...')).not.toBeInTheDocument();
  },
};

/** Before the status row lands — the loader is faded out and aria-hidden. */
export const StatusHidden: Story = {
  args: { showStatus: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Identity still shows; only the loader block is withheld.
    await expect(canvas.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const status = required(
      canvasElement.querySelector('[aria-hidden="true"].transition-opacity'),
      'status block'
    );
    await expect(status).toHaveClass('opacity-0');
  },
};

/** Reduced motion — LED, sweep, and message fade all stop; the track remains. */
export const ReducedMotion: Story = {
  args: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    const led = required(canvasElement.querySelector<HTMLElement>('.splash-led'), 'led');
    const sweep = required(canvasElement.querySelector<HTMLElement>('.splash-sweep'), 'sweep');
    await expect(led.style.animationName).toBe('');
    await expect(sweep.style.animationName).toBe('');
  },
};

/** Error — the failure message and a retry control replace the loader. */
export const Error: Story = {
  args: { variant: 'error', error: 'Could not read your music library.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Could not read your music library.')).toBeInTheDocument();
    // Asserted by role + accessible name rather than clicked: the handler calls
    // window.location.reload(), which would reload the story iframe.
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('.splash-sweep')).toBeNull();
  },
};

/** Error with no message — the retry copy stands in so the row is never blank. */
export const ErrorWithoutMessage: Story = {
  args: { variant: 'error', error: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Try again')).toHaveLength(2);
  },
};
