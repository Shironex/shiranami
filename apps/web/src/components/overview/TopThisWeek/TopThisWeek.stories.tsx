import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { ListeningStatsTrack } from '@/types/electron';

import TopThisWeek from './TopThisWeek';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 2400,
    lastPlayedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

const tracks: ListeningStatsTrack[] = [
  makeTrack({ trackId: 't1', title: 'Drift', playCount: 18 }),
  makeTrack({ trackId: 't2', title: 'Afterglow', playCount: 11 }),
  makeTrack({ trackId: 't3', title: 'Intro', playCount: 6 }),
];

/**
 * overview · TopThisWeek. The most-played-tracks leaderboard. A real `<h2>`
 * ("Top this week") sits beside an "Open library" header action; each ranked row
 * is a `<button>` labelled "Play {title}" that fires `onPlay` with the track id.
 * Cover art is a decorative `OverviewCover` fallback. With no tracks the rows are
 * replaced by an empty-state line. Stories drive a row + the header action with
 * `fn()` spies and assert the empty branch.
 */
const meta: Meta<typeof TopThisWeek> = {
  title: 'overview/TopThisWeek',
  component: TopThisWeek,
  parameters: {
    // Real heading; every row + the header action is a labelled button, covers
    // are aria-hidden — axe passes clean.
    a11y: { test: 'error' },
  },
  args: { onPlay: fn(), onOpenLibrary: fn() },
  decorators: [
    Story => (
      <div className="w-[34rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TopThisWeek>;

/** Three ranked tracks — clicking a row plays it; the header opens the library. */
export const Default: Story = {
  args: { tracks },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Top this week' })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Play Drift' }));
    await expect(args.onPlay).toHaveBeenCalledWith('t1');

    await userEvent.click(canvas.getByRole('button', { name: /Open library/ }));
    await expect(args.onOpenLibrary).toHaveBeenCalledTimes(1);
  },
};

/** No tracks — the rows are replaced by the empty-state copy. */
export const Empty: Story = {
  args: { tracks: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Top this week' })).toBeInTheDocument();
    await expect(canvas.getByText(/your week will start to take shape/)).toBeInTheDocument();
    // No play rows render in the empty state.
    await expect(canvas.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
  },
};
