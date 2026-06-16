import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { ListeningHistoryEntry } from '@/types/electron';

import HistoryRecentRow from './HistoryRecentRow';

function makeEntry(overrides: Partial<ListeningHistoryEntry> = {}): ListeningHistoryEntry {
  return {
    id: 'entry-1',
    trackId: 'track-1',
    title: 'Rainy day cafe',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    duration: 198,
    playedAt: new Date('2026-06-14T09:30:00.000Z').toISOString(),
    playedSeconds: 198,
    completionRatio: 1,
    completed: true,
    source: 'library',
    ...overrides,
  };
}

/**
 * history · HistoryRecentRow. One row in the "Recent Plays" list: a full-width
 * `<button>` holding the album-art tile, the track title over an
 * "Artist / Album" subtitle, and the played duration over a timestamp. Clicking
 * the row plays the track via `onPlay(trackId)`. Stories assert the row is a
 * button carrying the title + subtitle and that clicking fires the callback with
 * the entry's track id.
 */
const meta: Meta<typeof HistoryRecentRow> = {
  title: 'history/HistoryRecentRow',
  component: HistoryRecentRow,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // subtitle + timestamp lines use sub-opacity muted tokens (`text-muted-
  // foreground` and `/65`) over the row's translucent `bg-background/25`, so
  // axe's color-contrast ratio is non-deterministic against the layered
  // backdrop. The button role/name and click behaviour are asserted in `play`.
  args: {
    onPlay: fn(),
    entry: makeEntry(),
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryRecentRow>;

/** The row reads as a button with the track title; clicking plays the track. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // The button's accessible name is its concatenated text; match on the title
    // (the timestamp segment is locale/timezone dependent, so we don't pin it).
    const row = canvas.getByRole('button', { name: /Rainy day cafe/ });
    await expect(row).toHaveTextContent('Lofi Collective / Late Nights');

    await userEvent.click(row);
    await expect(args.onPlay).toHaveBeenCalledWith('track-1');
  },
};
