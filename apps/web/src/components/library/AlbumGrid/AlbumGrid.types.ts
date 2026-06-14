import type { RefObject } from 'react';
import type { GridImperativeAPI } from 'react-window';
import type { Track } from '@/stores/types';
import type { AlbumData } from '@/lib/albumSort';

export type AlbumGridSize = 'small' | 'medium' | 'large';

export interface IAlbumGridProps {
  /** The tracks to group into albums and render as a virtualized grid. */
  readonly library: Track[];
  /** Active text filter applied to album name/artist. */
  readonly searchQuery: string;
}

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

export interface IAlbumGridView {
  /** Ref attached to the outer container that the grid measures against. */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /** Imperative grid handle used for scroll capture/restore. */
  readonly gridRef: RefObject<GridImperativeAPI | null>;
  /** No albums match the active filter — render the empty state instead of the grid. */
  readonly isEmpty: boolean;
  /** True when returning to a previously scrolled grid — skips the entry fade. */
  readonly isReturning: boolean;
  /** Whether to show the "{{filtered}} of {{total}} albums" filter count line. */
  readonly showFilterCount: boolean;
  /** Localized filter-count line. */
  readonly filterCountLabel: string;
  /** Localized empty-state title. */
  readonly emptyTitle: string;
  /** Localized empty-state subtitle. */
  readonly emptySubtitle: string;
  /** Number of columns to render. */
  readonly columnCount: number;
  /** Number of rows to render. */
  readonly rowCount: number;
  /** Per-column width in px (gutter-adjusted). */
  readonly columnWidthPx: number;
  /** Per-row outer height in px. */
  readonly cellOuterHeight: number;
  /** Columns and container width are both measured — safe to mount the grid. */
  readonly showGrid: boolean;
  /** Stable props object passed through to each cell. */
  readonly cellProps: IAlbumCellProps;
}
