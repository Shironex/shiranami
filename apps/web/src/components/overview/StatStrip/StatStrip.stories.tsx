import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { ListeningStatsSummary } from '@/types/electron';

import StatStrip from './StatStrip';

const summary: ListeningStatsSummary = {
  totalPlays: 128,
  totalMinutes: 872,
  uniqueTracks: 64,
  uniqueArtists: 22,
  completedPlays: 110,
  topTracks: [],
  topArtists: [{ artist: 'Idealism', playCount: 41, listenedSeconds: 9000 }],
};

/**
 * overview · StatStrip. The four-up Overview stat grid: listened-this-week,
 * tracks-played, top-artist, and new-in-library tiles. Labels and trend copy are
 * localized from the `overview` namespace; the top artist and new-count come
 * from the supplied summary. Each tile's kanji watermark is decorative
 * (`aria-hidden`). Stories assert the four labels, the top artist, and the
 * week-over-week trend hint (present vs. the "No comparison yet" fallback).
 */
const meta: Meta<typeof StatStrip> = {
  title: 'overview/StatStrip',
  component: StatStrip,
  parameters: {
    // All four tiles are plain text on glass with aria-hidden watermarks —
    // axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[56rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatStrip>;

/** A full week with a positive trend — all four labels, the artist, and the delta hint. */
export const Default: Story = {
  args: {
    summary,
    newInLibraryCount: 3,
    trendDeltaMinutes: 138,
    sessionCount: 5,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Listened this week')).toBeInTheDocument();
    await expect(canvas.getByText('Tracks played')).toBeInTheDocument();
    await expect(canvas.getByText('Top artist this week')).toBeInTheDocument();
    await expect(canvas.getByText('New in library')).toBeInTheDocument();
    // Top artist + new-in-library values come from the summary / count.
    await expect(canvas.getByText('Idealism')).toBeInTheDocument();
    await expect(canvas.getByText('+3')).toBeInTheDocument();
    // +138 min ⇒ "+2h 18m vs. last week".
    await expect(canvas.getByText('+2h 18m vs. last week')).toBeInTheDocument();
  },
};

/** No prior window + nothing new — the trend falls back to "No comparison yet". */
export const NoComparison: Story = {
  args: {
    summary,
    newInLibraryCount: 0,
    trendDeltaMinutes: undefined,
    sessionCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No comparison yet')).toBeInTheDocument();
    // Nothing added ⇒ the new-in-library value reads "0".
    await expect(canvas.getByText('0')).toBeInTheDocument();
    await expect(canvas.queryByText(/vs\. last week/)).not.toBeInTheDocument();
  },
};
