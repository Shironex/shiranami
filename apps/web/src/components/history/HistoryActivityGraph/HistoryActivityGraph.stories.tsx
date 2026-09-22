import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { ListeningActivityPoint } from '@/types/electron';

import HistoryActivityGraph from './HistoryActivityGraph';

/** Build a contiguous run of daily activity points ending today. */
function makeSeries(days: number): ListeningActivityPoint[] {
  const today = new Date('2026-06-14T00:00:00.000Z');
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - index));
    const playCount = (index * 7) % 11;
    return {
      date: date.toISOString().slice(0, 10),
      playCount,
      listenedMinutes: playCount * 3.5,
    };
  });
}

/**
 * history · HistoryActivityGraph. The daily-listens bar chart for the History
 * dashboard. With data it renders a single `role="img"` wrapper whose aria-label
 * summarizes the window ("Listening activity: N plays over D days") and one bar
 * per day; with no points it renders the colocated `HistoryEmptyState`
 * ("No activity yet"). Stories assert the accessible graph label and the empty
 * fallback.
 */
const meta: Meta<typeof HistoryActivityGraph> = {
  title: 'history/HistoryActivityGraph',
  component: HistoryActivityGraph,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // per-bar date labels render with a very low-opacity muted token
  // (`text-muted-foreground/55`) and the empty fallback adds `/65` copy, both
  // over translucent panels — so axe's color-contrast ratio is non-deterministic
  // against the layered backdrop. The graph is decorative-by-design (it exposes
  // a single summarizing `role="img"` label, asserted in `play`).
  decorators: [
    Story => (
      <div className="w-[40rem] rounded-panel border border-border/25 p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryActivityGraph>;

/** 7-day window — the graph exposes a single summarizing image label. */
export const Default: Story = {
  args: {
    range: '7d',
    points: makeSeries(7),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // playCounts for 7 days = (i*7)%11 → 0+7+3+10+6+2+9 = 37 total plays.
    await expect(
      canvas.getByRole('img', { name: 'Listening activity: 37 plays over 7 days' })
    ).toBeInTheDocument();
  },
};

/** 30-day window — the label scales to the longer range. */
export const ThirtyDays: Story = {
  args: {
    range: '30d',
    points: makeSeries(30),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: /^Listening activity: \d+ plays over 30 days$/ })
    ).toBeInTheDocument();
  },
};

/** No data — the colocated "No activity yet" empty state replaces the bars. */
export const Empty: Story = {
  args: {
    range: '7d',
    points: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The empty branch renders HistoryEmptyState, not the role="img" graph.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
    await expect(canvas.getByText('No activity yet')).toBeInTheDocument();
  },
};
