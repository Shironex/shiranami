import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, screen, userEvent, expect } from 'storybook/test';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import { SleepTimer } from './index';

/** Seed the sleep-timer store the trigger/popover reflect. */
function seedTimer(endTime: number | null, remaining: number, windDown = false): void {
  useSleepTimerStore.setState({ endTime, remaining, windDown, stopMode: null });
}

/**
 * player · SleepTimer. An icon-only popover trigger ("Sleep timer") that opens a
 * panel of duration presets plus a custom-minutes input, backed by
 * `useSleepTimerStore`. When a timer is running the trigger swaps to a TimerOff
 * glyph (the aria-label stays "Sleep timer"), and the panel shows the remaining
 * time and a Cancel control. The popover content portals to `document.body`, so
 * stories query it via `screen`. Stories seed the store, open the popover, and
 * assert the preset/cancel controls by role + name.
 */
const meta: Meta<typeof SleepTimer> = {
  title: 'player/SleepTimer',
  component: SleepTimer,
  parameters: {
    // The trigger is labelled, the preset/cancel controls are text buttons, and
    // the custom input carries an aria-label — axe passes for the open popover.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SleepTimer>;

/** Idle — opening the trigger reveals the duration presets and the custom option. */
export const Idle: Story = {
  decorators: [
    Story => {
      seedTimer(null, 0);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Sleep timer' });
    await userEvent.click(trigger);

    // Popover content portals to body — query it via screen. Preset buttons are
    // labelled by their pluralized minutes text; "Custom" reveals the input mode.
    await expect(await screen.findByRole('button', { name: 'Custom' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: '15 minutes' })).toBeInTheDocument();
    // The track-boundary stops sit between the presets and the wind-down.
    await expect(screen.getByRole('button', { name: 'End of track' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'End of album' })).toBeInTheDocument();
    // The wind-down ending sits under the presets with its one-line hint.
    await expect(screen.getByRole('button', { name: /Wind down/ })).toBeInTheDocument();
  },
};

/** Armed boundary stop — the panel labels the boundary instead of a countdown. */
export const StoppingAfterTrack: Story = {
  decorators: [
    Story => {
      seedTimer(null, 0);
      useSleepTimerStore.setState({ stopMode: 'track' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sleep timer' }));
    await expect(await screen.findByText('Stopping after this track')).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Cancel timer' })).toBeInTheDocument();
  },
};

/** Winding down — the running wind-down labels itself so the dim reads as intended. */
export const WindingDown: Story = {
  decorators: [
    Story => {
      seedTimer(Date.now() + 480_000, 480, true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sleep timer' }));
    // The panel heading swaps from "Timer active" to "Winding down".
    await expect(await screen.findByText('Winding down')).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Cancel timer' })).toBeInTheDocument();
  },
};

/** Running — the panel shows the remaining time and a cancel control. */
export const Running: Story = {
  decorators: [
    Story => {
      seedTimer(Date.now() + 1_800_000, 1800);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The trigger keeps its "Sleep timer" accessible name even while active.
    await userEvent.click(canvas.getByRole('button', { name: 'Sleep timer' }));
    await expect(await screen.findByRole('button', { name: 'Cancel timer' })).toBeInTheDocument();
    // 1800s remaining formats to "30:00", but the timer ticks down via Date.now()
    // so the exact second is flaky — match the mm:ss shape (29/30 minutes) instead
    // of pinning the literal string.
    await expect(screen.getByText(/^(29|30):\d{2}$/)).toBeInTheDocument();
  },
};
