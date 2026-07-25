import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';

import DragOverlayContent from './DragOverlayContent';

// A 1×1 transparent PNG so the artwork story renders a real <img> without a
// network fetch.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Girl',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

/**
 * playlists · DragOverlayContent. The floating preview dnd-kit renders under the
 * cursor while a playlist track is being reordered. It mirrors the sortable
 * row's 48px layout — inert grip, 36px cover (or the `Play` fallback glyph),
 * title over artist, right-aligned duration — on the `bg-accent` surface that
 * lifts it off the list. It lives inside a `DragOverlay` portal and is never
 * interactive, so the stories render it directly and assert what each branch
 * shows rather than simulating a drag.
 */
const meta: Meta<typeof DragOverlayContent> = {
  title: 'playlists/DragOverlayContent',
  component: DragOverlayContent,
  parameters: {
    // The cover <img> carries the track title as its alt; the grip, fallback
    // glyph and duration are decorative text/icons on the accent surface —
    // the same tokens the sortable row ships with, so axe passes clean.
    a11y: { test: 'error' },
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

type Story = StoryObj<typeof DragOverlayContent>;

/** Cover art present — the preview shows the image, title, artist and duration. */
export const Default: Story = {
  args: {
    track: makeTrack({ albumArt: PIXEL_PNG }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Midnight study session' })).toBeInTheDocument();
    await expect(canvas.getByText('Lofi Girl')).toBeInTheDocument();
    await expect(canvas.getByText('3:35')).toBeInTheDocument();
  },
};

/** No cover art — the decorative play glyph stands in, so no image renders. */
export const NoArtwork: Story = {
  args: {
    track: makeTrack({ albumArt: undefined }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
    await expect(canvas.getByText('Midnight study session')).toBeInTheDocument();
  },
};

/** Unprobed file (duration 0) — the duration cell renders but stays blank. */
export const UnknownDuration: Story = {
  args: {
    track: makeTrack({ duration: 0 }),
  },
  play: async ({ canvasElement }) => {
    const durationCell = canvasElement.querySelector('.tabular-nums');
    await expect(durationCell).not.toBeNull();
    await expect(durationCell?.textContent).toBe('');
  },
};

/** Long metadata — title and artist truncate instead of widening the preview. */
export const LongMetadata: Story = {
  args: {
    track: makeTrack({
      title: 'Rainy window loops for late-night studying, chapter twelve (extended edit)',
      artist: 'A Very Long Collective Name Featuring Several Other Artists',
      duration: 3725,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Rainy window loops/)).toHaveClass('truncate');
    await expect(canvas.getByText(/A Very Long Collective Name/)).toHaveClass('truncate');
    // Past an hour the shared formatter rolls over to h:mm:ss.
    await expect(canvas.getByText('1:02:05')).toBeInTheDocument();
  },
};
