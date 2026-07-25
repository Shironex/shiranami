import type { CSSProperties } from 'react';
import type { AlbumData } from '@/lib/albumSort';

/** Props handed to each virtualized album cell beyond react-window's own. */
export interface IAlbumCellProps {
  /** The filtered albums backing the grid, indexed by row/column. */
  readonly albums: AlbumData[];
  /** Number of columns currently laid out — used to flatten the cell index. */
  readonly columnCount: number;
  /** Inter-cell gap in px, split into per-edge insets. */
  readonly gap: number;
  /** Select an album by its key, persisting scroll position. */
  readonly onAlbumClick: (key: string) => void;
  /** Tailwind padding class for the card, derived from the grid size. */
  readonly cardPaddingClass: string;
  /** Square cover image edge length in px. */
  readonly imgPx: number;
  /** Localized "{{count}} tracks" label for a card. */
  readonly trackCountLabel: (count: number) => string;
}

export interface IAlbumCellView {
  /**
   * The album at this cell's flattened index, or `null` for the trailing cells
   * of a partially filled last row.
   */
  readonly album: AlbumData | null;
  /** react-window's positioned `style` with the half-gap edge insets folded in. */
  readonly insetStyle: CSSProperties;
  /** Tailwind padding class for the card, derived from the grid size. */
  readonly cardPaddingClass: string;
  /** Square cover image edge length in px. */
  readonly imgPx: number;
  /** Localized "{{count}} tracks" label for this cell's album, `''` when empty. */
  readonly trackCountLabel: string;
  /** Opens this cell's album — the album key is already bound. */
  readonly onSelect: () => void;
}
