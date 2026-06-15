import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, screen, userEvent, expect } from 'storybook/test';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import { SleepTimer } from './index';

/** Seed the sleep-timer store the trigger/popover reflect. */
function seedTimer(endTime: number | null, remaining: number): void {
  useSleepTimerStore.setState({ endTime, remaining });
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
