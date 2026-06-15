import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';

import ArtCollage from './ArtCollage';

/** A 1x1 transparent PNG so stories render artwork without bundling assets. */
const ART =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats to relax and study to',
    artist: 'Chillhop',
    album: 'Essentials',
    duration: 215,
    filePath: '/music/lofi.mp3',
    albumArt: ART,
    ...overrides,
  };
}

function makeLibrary(count: number): Track[] {
  return Array.from({ length: count }).map((_, i) => makeTrack({ id: `track-${i}` }));
}

/**
 * mixes · ArtCollage. A purely decorative strip of album-art thumbnails pulled
 * from the library, shown at the foot of the mixes overview. Every thumbnail is
 * an `aria-hidden`, empty-`alt` image (it carries no information of its own), so
 * the collage exposes no roles to assistive tech — axe passes clean. It hides
 * itself entirely when too few tracks carry artwork.
 */
const meta: Meta<typeof ArtCollage> = {
  title: 'mixes/ArtCollage',
  component: ArtCollage,
  parameters: {
    // Thumbnails are decorative: every <img> is aria-hidden with an empty alt,
    // so axe finds nothing to name — passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ArtCollage>;

/** Enough artwork to fill the strip — caps at 12 decorative thumbnails. */
export const Default: Story = {
  args: {
    library: makeLibrary(12),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The thumbnails are decorative (aria-hidden), so they expose no role —
    // assert the rendered count via the underlying <img> tags instead.
    const thumbs = canvasElement.querySelectorAll('img');
    await expect(thumbs).toHaveLength(12);
    for (const img of thumbs) {
      await expect(img).toHaveAttribute('aria-hidden', 'true');
      await expect(img).toHaveAttribute('alt', '');
    }
    // No decorative image leaks an accessible name into the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** Too few tracks carry artwork — the collage hides itself entirely. */
export const TooFew: Story = {
  args: {
    library: makeLibrary(2),
  },
  play: async ({ canvasElement }) => {
    // Below the threshold the component returns null, so nothing renders.
    await expect(canvasElement.querySelector('img')).toBeNull();
  },
};
