import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { ListeningHourlyActivityPoint } from '@/types/electron';
import { buildHeatmap } from '../overviewUtils';

import ListeningClock from './ListeningClock';

const points: ListeningHourlyActivityPoint[] = [
  { dayOfWeek: 1, hour: 22, playCount: 6, listenedMinutes: 18 },
  { dayOfWeek: 2, hour: 23, playCount: 4, listenedMinutes: 12 },
  { dayOfWeek: 3, hour: 9, playCount: 2, listenedMinutes: 6 },
  { dayOfWeek: 5, hour: 21, playCount: 9, listenedMinutes: 27 },
];

/**
 * overview · ListeningClock. The last-7-days listening heatmap — 7 weekday rows
 * × 24 hours. The card has a real `<h2>` ("Listening clock") and a "Last 7 days"
 * eyebrow; the grid is a single `role="img"` with an accessible summary label so
 * a screen reader gets one description instead of 168 cells. Intensity is also
 * cued by a non-color ring on the busiest cells. When there are no plays the
 * grid is replaced by an empty-state line. Stories cover the populated grid (+
 * peak label) and the empty state.
 */
const meta: Meta<typeof ListeningClock> = {
  title: 'overview/ListeningClock',
  component: ListeningClock,
  parameters: {
    // Real heading, the grid is a labelled role="img", legend swatches are
    // aria-hidden, and intensity has a non-color cue — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ListeningClock>;

/** A week with a clear evening peak — heading, the labelled grid, and the peak line. */
export const Default: Story = {
  args: {
    heatmap: buildHeatmap(points),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Listening clock' })).toBeInTheDocument();
    // The 168-cell grid collapses to one accessible image.
    await expect(canvas.getByRole('img', { name: /Listening clock/ })).toBeInTheDocument();
    // The busiest window (21:00, two days) surfaces as the peak label.
    await expect(canvas.getByText(/Loudest at 21:00/)).toBeInTheDocument();
  },
};

/** No listening data — the grid is replaced by the empty-state copy. */
export const Empty: Story = {
  args: {
    heatmap: buildHeatmap([]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Listening clock' })).toBeInTheDocument();
    await expect(canvas.getByText(/Your listening clock fills in/)).toBeInTheDocument();
    // The grid only renders when there's data.
    await expect(canvas.queryByRole('img', { name: /Listening clock/ })).not.toBeInTheDocument();
  },
};
