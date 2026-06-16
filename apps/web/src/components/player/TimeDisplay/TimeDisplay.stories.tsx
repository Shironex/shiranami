import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { usePlayerUIStore } from '@/stores/usePlayerUIStore';

import { TimeDisplay } from './index';

/** Seed the playback/scrub time the readout reflects. */
function seedTime(currentTime: number, scrubTime: number | null): void {
  usePlaybackStore.setState({ currentTime });
  usePlayerUIStore.setState({ scrubTime });
}

/**
 * player · TimeDisplay. A memoized text-only readout of the current playback
 * position, isolated so per-second time ticks re-render it alone rather than the
 * whole player. It renders `formatDuration(scrubTime ?? currentTime)` as bare
 * text (no wrapping element of its own), subscribing to `usePlaybackStore` for
 * currentTime and `usePlayerUIStore` for the active scrub value. Stories seed
 * those and assert the formatted m:ss string it prints.
 */
const meta: Meta<typeof TimeDisplay> = {
  title: 'player/TimeDisplay',
  component: TimeDisplay,
  parameters: {
    // Plain text content with no interactive elements — nothing for axe to flag.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <span className="tabular-nums text-sm text-muted-foreground">
        <Story />
      </span>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TimeDisplay>;

/** Playing — the readout formats the current playback time as m:ss. */
export const Playing: Story = {
  decorators: [
    Story => {
      seedTime(83, null);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 83s → "1:23" via formatDuration.
    await expect(canvas.getByText('1:23')).toBeInTheDocument();
  },
};

/** Scrubbing — the active scrub time overrides the playback time on the readout. */
export const Scrubbing: Story = {
  decorators: [
    Story => {
      seedTime(83, 12);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // scrubTime (12 → "0:12") wins over currentTime (83) while dragging.
    await expect(canvas.getByText('0:12')).toBeInTheDocument();
  },
};
