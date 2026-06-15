import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useCompactStore } from '@/stores/useCompactStore';

import CompactModePreview from './CompactModePreview';

/**
 * settings · CompactModePreview. A presentational mock of the mini-player whose
 * size, typography, padding, and visible elements are read from `useCompactStore`.
 * The whole sample is a single `role="img"` labelled "Preview"; the sample track
 * title/artist/album text render inside it, plus a "Preview only…" disclaimer.
 */
const meta: Meta<typeof CompactModePreview> = {
  title: 'settings/CompactModePreview',
  component: CompactModePreview,
  // Single labelled role="img"; inner mock graphics are decorative — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompactModePreview>;

/** Default — the labelled preview image and its sample track text render. */
export const Default: Story = {
  decorators: [
    Story => {
      useCompactStore.setState({
        compactSize: 'md',
        compactFontSize: 'md',
        compactShowAlbumArt: true,
        compactShowAlbum: true,
        compactShowSeek: true,
        compactShowVolume: true,
        compactShowFavorite: false,
        compactShowLyrics: false,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Preview' })).toBeInTheDocument();
    await expect(canvas.getByText('Sample track title')).toBeInTheDocument();
  },
};

/** Large with lyrics — the album line still renders at the larger size. */
export const LargeWithLyrics: Story = {
  decorators: [
    Story => {
      useCompactStore.setState({
        compactSize: 'lg',
        compactFontSize: 'lg',
        compactShowAlbum: true,
        compactShowFavorite: true,
        compactShowLyrics: true,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Preview' })).toBeInTheDocument();
    await expect(canvas.getByText('Sample album')).toBeInTheDocument();
  },
};
