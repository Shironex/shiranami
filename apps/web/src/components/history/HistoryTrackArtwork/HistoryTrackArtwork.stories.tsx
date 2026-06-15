import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import HistoryTrackArtwork from './HistoryTrackArtwork';

// A 1×1 transparent PNG so the artwork story renders a real <img> without a
// network fetch.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * history · HistoryTrackArtwork. The 44px album-art tile used by the history
 * rows. Wraps the shared `TrackThumbnail`: when `albumArt` is present it renders
 * an `<img>` whose `alt` is the track title; when it's `null` it renders the
 * decorative `Music` fallback icon. Stories cover both branches.
 */
const meta: Meta<typeof HistoryTrackArtwork> = {
  title: 'history/HistoryTrackArtwork',
  component: HistoryTrackArtwork,
  parameters: {
    // The artwork branch renders an <img> with a real `alt` (the title); the
    // fallback branch is a bare decorative icon with no accessible name. Neither
    // is an axe violation, so the component is ratcheted to error.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryTrackArtwork>;

/** No cover art — the decorative fallback icon stands in (no image rendered). */
export const Fallback: Story = {
  args: {
    albumArt: null,
    title: 'Midnight study session',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The null branch renders the Music icon, not an <img>, so no image is in
    // the accessibility tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** With cover art — the image renders with the track title as its alt text. */
export const WithArtwork: Story = {
  args: {
    albumArt: PIXEL_PNG,
    title: 'Midnight study session',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: args.title })).toBeInTheDocument();
  },
};
