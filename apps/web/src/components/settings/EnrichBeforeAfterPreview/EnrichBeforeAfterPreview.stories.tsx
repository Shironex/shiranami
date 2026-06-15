import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import EnrichBeforeAfterPreview from './EnrichBeforeAfterPreview';

/**
 * settings · EnrichBeforeAfterPreview. A static before/after sample of what
 * enrichment does to a track: raw filename-derived tags ("From filename" — no
 * art, Unknown artist/album) on the left, and filled cover art, artist, and
 * album with a confidence pill ("Enriched") on the right. Purely presentational
 * — it makes the feature's value legible before the user commits to the
 * irreversible file-write path. No store or IPC dependency.
 */
const meta: Meta<typeof EnrichBeforeAfterPreview> = {
  title: 'settings/EnrichBeforeAfterPreview',
  component: EnrichBeforeAfterPreview,
  parameters: {
    // Static text + decorative icons (the arrow is aria-hidden); no interactive
    // controls — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Both sides render — the raw "before" tags and the enriched "after" tags. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Column captions.
    await expect(canvas.getByText('From filename')).toBeInTheDocument();
    await expect(canvas.getByText('Enriched')).toBeInTheDocument();
    // "Before" shows the unknown placeholders the scanner wrote.
    await expect(canvas.getByText('Unknown Artist')).toBeInTheDocument();
    await expect(canvas.getByText('Unknown Album')).toBeInTheDocument();
    // "After" shows the resolved artist + album.
    await expect(canvas.getByText('Nujabes')).toBeInTheDocument();
    await expect(canvas.getByText('Modal Soul')).toBeInTheDocument();
    // The illustrative 0.92 sample resolves to the high "Strong match" tier.
    await expect(canvas.getByText('Strong match')).toBeInTheDocument();
  },
};
