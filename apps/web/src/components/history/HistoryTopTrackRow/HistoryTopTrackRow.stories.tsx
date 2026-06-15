import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { ListeningStatsTrack } from '@/types/electron';

import HistoryTopTrackRow from './HistoryTopTrackRow';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    albumArt: null,
    playCount: 12,
    listenedSeconds: 4200,
    lastPlayedAt: new Date('2026-06-14T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

/**
 * history · HistoryTopTrackRow. One row in the "Top Tracks" leaderboard: a
 * full-width `<button>` holding the album-art tile, the track title over its
 * artist, and the localized play count over the listened-time label. Clicking
 * plays the track via `onPlay(trackId)`. Stories assert the button name + play
 * count and that a click fires the callback with the track id.
 */
const meta: Meta<typeof HistoryTopTrackRow> = {
  title: 'history/HistoryTopTrackRow',
  component: HistoryTopTrackRow,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // artist + listened-time lines use sub-opacity muted tokens (`text-muted-
  // foreground` and `/65`) over the row's translucent `bg-background/25`, so
  // axe's color-contrast ratio is non-deterministic against the layered
  // backdrop. The button role/name and click behaviour are asserted in `play`.
  args: {
    onPlay: fn(),
    track: makeTrack(),
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

type Story = StoryObj<typeof HistoryTopTrackRow>;

/** The row reads as a button with the title + "12 plays"; clicking plays it. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('button', { name: /Midnight study session/ });
    // The localized "{{count}} plays" label resolves from the history namespace.
    await expect(row).toHaveTextContent('12 plays');

    await userEvent.click(row);
    await expect(args.onPlay).toHaveBeenCalledWith('track-1');
  },
};
