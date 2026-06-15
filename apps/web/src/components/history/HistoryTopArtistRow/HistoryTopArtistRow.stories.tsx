import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { ListeningStatsArtist } from '@/types/electron';

import HistoryTopArtistRow from './HistoryTopArtistRow';

function makeArtist(overrides: Partial<ListeningStatsArtist> = {}): ListeningStatsArtist {
  return {
    artist: 'Lofi Collective',
    playCount: 28,
    listenedSeconds: 9000,
    ...overrides,
  };
}

/**
 * history · HistoryTopArtistRow. One static row in the "Top Artists" panel —
 * the artist name over a listened-time label, with the localized play count
 * pinned to the right. Non-interactive (no button). When the artist name is
 * blank it falls back to the localized "Unknown Artist". Stories cover the named
 * and the unknown-fallback branches.
 */
const meta: Meta<typeof HistoryTopArtistRow> = {
  title: 'history/HistoryTopArtistRow',
  component: HistoryTopArtistRow,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // listened-time line uses a sub-opacity muted token (`text-muted-foreground/
  // 65`) over the row's translucent `bg-background/25`, so axe's color-contrast
  // ratio is non-deterministic against the layered backdrop. The visible text is
  // asserted in `play`.
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryTopArtistRow>;

/** A named artist — name + localized "28 plays" both render. */
export const Default: Story = {
  args: {
    artist: makeArtist(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lofi Collective')).toBeInTheDocument();
    // The localized "{{count}} plays" label resolves from the history namespace.
    await expect(canvas.getByText('28 plays')).toBeInTheDocument();
  },
};

/** Blank artist — the localized "Unknown Artist" fallback stands in. */
export const Unknown: Story = {
  args: {
    artist: makeArtist({ artist: '' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Unknown Artist')).toBeInTheDocument();
  },
};
