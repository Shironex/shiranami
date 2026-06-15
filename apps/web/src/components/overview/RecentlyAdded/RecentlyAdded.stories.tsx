import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { Track } from '@/stores/types';

import RecentlyAdded from './RecentlyAdded';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/drift.mp3',
    createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    ...overrides,
  };
}

const tracks: Track[] = [
  makeTrack({ id: 't1', title: 'Drift' }),
  makeTrack({
    id: 't2',
    title: 'Afterglow',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  }),
  makeTrack({
    id: 't3',
    title: 'Intro',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }),
];

/**
 * overview · RecentlyAdded. A horizontally-scrolling rail of the most recently
 * imported tracks. A real `<h2>` ("Recently added") sits beside a "{n} new
 * tracks" count; each card is a `<button>` labelled "Play {title}" that fires
 * `onPlay` with the track id. Subtitles carry a relative "added N ago" string
 * (non-deterministic), so stories assert the stable heading, count, and card
 * roles rather than the relative time. Cover art is a decorative `OverviewCover`
 * fallback.
 */
const meta: Meta<typeof RecentlyAdded> = {
  title: 'overview/RecentlyAdded',
  component: RecentlyAdded,
  parameters: {
    // Real heading; each card is a labelled button in a list, covers are
    // aria-hidden — axe passes clean.
    a11y: { test: 'error' },
  },
  args: { onPlay: fn() },
  decorators: [
    Story => (
      <div className="w-[40rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RecentlyAdded>;

/** Three new tracks — the count label, a card per track, and play-on-click. */
export const Default: Story = {
  args: { tracks },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Recently added' })).toBeInTheDocument();
    await expect(canvas.getByText('3 new tracks')).toBeInTheDocument();
    // One card button per track.
    await expect(canvas.getAllByRole('button', { name: /^Play / })).toHaveLength(3);

    await userEvent.click(canvas.getByRole('button', { name: 'Play Drift' }));
    await expect(args.onPlay).toHaveBeenCalledWith('t1');
  },
};
