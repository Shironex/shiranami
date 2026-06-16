import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import ClockCard from './ClockCard';

/**
 * overview · ClockCard. The live ticking clock card. A 1s interval re-renders
 * only this subtree; the time digits and the day-period are intentionally
 * `aria-hidden` and the container carries a single stable `aria-label` ("Current
 * time, …") so a screen reader isn't told the time every second. The bottom row
 * shows a decorative mood glyph beside either an injected weather row or a
 * fallback mood line. The wall-clock time is non-deterministic, so stories
 * assert the stable labelled `group` and the injected weather row rather than a
 * specific time string.
 */
const meta: Meta<typeof ClockCard> = {
  title: 'overview/ClockCard',
  component: ClockCard,
  parameters: {
    // The container exposes a stable aria-label; every time digit and the mood
    // glyph are aria-hidden — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ClockCard>;

/** No weather row — the time-of-day glyph + a quiet mood line, zero network calls. */
export const TimeOfDay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The whole card is a labelled group; the time itself is aria-hidden and
    // changes every second, so we assert the stable accessible label.
    await expect(canvas.getByRole('group', { name: /Current time/ })).toBeInTheDocument();
  },
};

/** Weather override — an injected weather row replaces the fallback mood line. */
export const WithWeatherGlyph: Story = {
  args: {
    glyph: '雨',
    weatherRow: (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground/85">Rain · 12°C</p>
        <p className="truncate text-xs text-muted-foreground/60">A good night for slow records.</p>
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: /Current time/ })).toBeInTheDocument();
    // The injected weather row renders in place of the fallback mood line. The
    // mood glyph itself is decorative (aria-hidden), so we assert the row text.
    await expect(canvas.getByText('Rain · 12°C')).toBeInTheDocument();
  },
};
