import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { AlbumData } from '@/lib/albumSort';

import AlbumCell from './AlbumCell';

const ALBUM_KEY = 'idealism--midnight-tapes';

function makeAlbum(overrides: Partial<AlbumData> = {}): AlbumData {
  return {
    key: ALBUM_KEY,
    name: 'Midnight Tapes',
    albumArtist: 'Idealism',
    artist: 'Idealism',
    year: 2019,
    createdAt: null,
    trackCount: 8,
    tracks: [],
    ...overrides,
  };
}

const albums: AlbumData[] = [
  makeAlbum(),
  makeAlbum({ key: 'aso--rainy-day', name: 'Rainy Day', artist: 'Aso', trackCount: 12 }),
  makeAlbum({ key: 'kupla--slow-morning', name: 'Slow Morning', artist: 'Kupla', trackCount: 5 }),
];

/**
 * library · AlbumCell. One cell of the virtualized album grid: a labelled
 * `<button>` card with the cover art (or a disc fallback), the album title, the
 * aggregated artist line and a localized track count. The wrapper folds
 * `react-window`'s positioned `style` together with half-gap edge insets, so the
 * outer grid edges stay flush while interior cells get their gutter. Cells whose
 * flattened index runs past the last album render an `aria-hidden` spacer
 * instead of a card. Stories cover the disc fallback, real cover art, an
 * interior column's gutters, and the trailing empty cell.
 */
const meta: Meta<typeof AlbumCell> = {
  title: 'library/AlbumCell',
  component: AlbumCell,
  parameters: {
    // The card is a single labelled <button>, the disc fallback is a decorative
    // SVG and the empty cell is aria-hidden — axe passes clean, matching the
    // AlbumGrid story that renders these same cells.
    a11y: { test: 'error' },
  },
  args: {
    ariaAttributes: { 'aria-colindex': 1, role: 'gridcell' },
    columnIndex: 0,
    rowIndex: 0,
    style: { width: 220, height: 300 },
    albums,
    columnCount: 3,
    gap: 12,
    onAlbumClick: fn(),
    cardPaddingClass: 'p-4',
    imgPx: 188,
    trackCountLabel: (count: number) => `${count} tracks`,
  },
  decorators: [
    Story => (
      <div className="w-[16rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AlbumCell>;

/** First cell, no cover art — the disc fallback plus title, artist, count. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole('button', { name: /Midnight Tapes/ });
    await expect(card).toHaveTextContent('Idealism');
    await expect(card).toHaveTextContent('8 tracks');

    await userEvent.click(card);
    await expect(args.onAlbumClick).toHaveBeenCalledWith(ALBUM_KEY);
  },
};

/** With cover art — the image replaces the disc fallback, alt'd by album name. */
export const WithCoverArt: Story = {
  args: {
    albums: [
      makeAlbum({
        albumArt:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#6b5ea8"/></svg>'
          ),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Midnight Tapes' })).toBeInTheDocument();
  },
};

/**
 * The middle column of the first row — both side gutters get the half-gap inset
 * while the top stays flush with the grid's outer edge.
 */
export const InteriorColumn: Story = {
  args: {
    columnIndex: 1,
    rowIndex: 0,
    albums,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole('button', { name: /Rainy Day/ });

    const cell = card.parentElement as HTMLElement;
    await expect(cell.style.paddingLeft).toBe('6px');
    await expect(cell.style.paddingRight).toBe('6px');
    await expect(cell.style.paddingTop).toBe('0px');
  },
};

/** A trailing cell past the last album — an aria-hidden spacer, no card. */
export const EmptyCell: Story = {
  args: {
    columnIndex: 2,
    rowIndex: 1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('[aria-hidden="true"]')).not.toBeNull();
  },
};
