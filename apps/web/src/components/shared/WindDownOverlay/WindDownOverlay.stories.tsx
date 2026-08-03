import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { useWindDownStore } from '@/stores/useWindDownStore';

import WindDownOverlay from './WindDownOverlay';

/** Seed the two stores the overlay is driven by. */
function seedWindDown(remainingSeconds: number | null, closingLine: boolean): void {
  useSleepTimerStore.setState(
    remainingSeconds === null
      ? { endTime: null, duration: null, remaining: 0, windDown: false }
      : {
          endTime: Date.now() + remainingSeconds * 1000,
          duration: 15,
          remaining: remainingSeconds,
          windDown: true,
        }
  );
  useWindDownStore.setState({
    closingLineUntil: closingLine ? Date.now() + 60_000 : null,
  });
}

/**
 * shared · WindDownOverlay. The wind-down ending's visible half: a black veil
 * that ramps in over the timer's final minutes above the whole shell (capped at
 * a readable dim), then carries the single closing line while the fade settles.
 * `pointer-events-none` throughout — the app underneath stays fully usable, and
 * any real interaction lifts the dim (see the hook). Stories seed the sleep-
 * timer/wind-down stores directly and render the overlay above a mock page.
 */
const meta: Meta<typeof WindDownOverlay> = {
  title: 'shared/WindDownOverlay',
  component: WindDownOverlay,
  parameters: {
    // While dimming the layer is pure aria-hidden decoration; the closing line
    // is a polite `status` with real text — both pass axe.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative h-72 w-full overflow-hidden rounded-xl bg-background p-6">
        <p className="text-sm text-muted-foreground">
          The room behind the veil — still readable at the deepest dim.
        </p>
        <button
          type="button"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Still clickable
        </button>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WindDownOverlay>;

/** Mid-ramp — five minutes left of the ten-minute window, veil at half dim. */
export const Dimming: Story = {
  decorators: [
    Story => {
      seedWindDown(300, false);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const veil = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(veil).not.toBeNull();
    // The veil never swallows the page underneath.
    await expect(veil!.parentElement).toHaveClass('pointer-events-none');
    await expect(canvas.getByRole('button', { name: 'Still clickable' })).toBeEnabled();
    // No role or name reaches the a11y tree while dimming.
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};

/** The ending itself — playback has faded out and the closing line lingers. */
export const ClosingLine: Story = {
  decorators: [
    Story => {
      seedWindDown(null, true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const line = await canvas.findByRole('status');
    await expect(line).toHaveTextContent(/sleep well/i);
  },
};
