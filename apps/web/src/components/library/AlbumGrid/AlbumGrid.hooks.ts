import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getScrollbarSize, type GridImperativeAPI } from 'react-window';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { groupTracksByAlbum } from '@/lib/albumSort';
import type { AlbumGridSize, IAlbumGridProps, IAlbumGridView } from './AlbumGrid.types';

// Tailwind breakpoint columns mirrored in JS so Grid can compute layout. The
// non-virtualized version delegated to CSS grid, but Grid needs an explicit
// columnCount.
const COLUMN_COUNTS: Record<AlbumGridSize, ReadonlyArray<readonly [number, number]>> = {
  // [minViewportWidthPx, columns]
  small: [
    [1536, 8],
    [1280, 6],
    [1024, 5],
    [768, 4],
    [0, 3],
  ],
  medium: [
    [1536, 6],
    [1280, 5],
    [1024, 4],
    [768, 3],
    [0, 2],
  ],
  large: [
    [1536, 5],
    [1280, 4],
    [1024, 3],
    [0, 2],
  ],
};

function columnsFor(size: AlbumGridSize, viewportWidth: number): number {
  const table = COLUMN_COUNTS[size];
  for (const [minWidth, cols] of table) {
    if (viewportWidth >= minWidth) return cols;
  }
  return table[table.length - 1][1];
}

// Card height is title (sm) + artist (xs) + count (10px) + paddings + img.
// Image height = (cellWidth - 2*padding). Total = imgHeight + textBlock + p*2.
// Padding: small=p-3 (12), medium/large=p-4 (16). Mb-3 between img and text.
// Text block: title 20 + mt-0.5 2 + artist 16 + mt-1.5 6 + count 14 = 58px + 6px safety = 64px.
export const ROW_HEIGHT_TEXT_BLOCK = 64;
// Tailwind mb-3 between the cover image and the text block — the button is
// flex flex-col so this margin takes real vertical space and must be in the
// row-height math, otherwise the text overflows past the visible card edge.
const IMG_TEXT_GAP_PX = 12;
const GAP_PX: Record<AlbumGridSize, number> = { small: 8, medium: 12, large: 16 };
const PADDING_PX: Record<AlbumGridSize, number> = { small: 12, medium: 16, large: 16 };

export function useAlbumGrid({ library, searchQuery }: IAlbumGridProps): IAlbumGridView {
  const { t } = useTranslation('library');
  const selectAlbum = useViewStore(s => s.selectAlbum);
  const albumGridScrollTop = useViewStore(s => s.albumGridScrollTop);
  const setAlbumGridScrollTop = useViewStore(s => s.setAlbumGridScrollTop);
  const albumGridSize = useUIStore(s => s.albumGridSize);
  const albumSortMode = useUIStore(s => s.albumSortMode);
  const albumSortOrder = useUIStore(s => s.albumSortOrder);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridImperativeAPI | null>(null);
  // Capture once at mount — used for scroll restore + skipping the entry animation.
  const savedScrollTop = useRef(albumGridScrollTop);
  const isReturning = useRef(albumGridScrollTop > 0);

  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleAlbumClick = useCallback(
    (albumKey: string) => {
      const offset = gridRef.current?.element?.scrollTop ?? 0;
      setAlbumGridScrollTop(offset);
      selectAlbum(albumKey);
    },
    [selectAlbum, setAlbumGridScrollTop]
  );

  const albums = useMemo(
    () => groupTracksByAlbum(library, albumSortMode, albumSortOrder),
    [library, albumSortMode, albumSortOrder]
  );

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums;
    const q = searchQuery.toLowerCase();
    return albums.filter(
      a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    );
  }, [albums, searchQuery]);

  const trackCountLabel = useCallback((count: number) => t('trackCount', { count }), [t]);

  const cardPaddingClass = albumGridSize === 'small' ? 'p-3' : 'p-4';

  // Compute column count from container width (uses Tailwind breakpoint
  // table mirrored above).
  const columnCount = useMemo(() => {
    if (containerWidth <= 0) return columnsFor(albumGridSize, 1280);
    return columnsFor(albumGridSize, containerWidth);
  }, [albumGridSize, containerWidth]);

  // Subtract the Grid's own scrollbar gutter so the rightmost column does not
  // render behind the scrollbar (getScrollbarSize is react-window's canonical
  // answer to this — returns 0 on overlay-scrollbar platforms).
  const gap = GAP_PX[albumGridSize];
  const padding = PADDING_PX[albumGridSize];
  const scrollbarSize = getScrollbarSize();
  const columnWidthPx =
    columnCount > 0 ? Math.max(0, containerWidth - scrollbarSize) / columnCount : 0;
  // The image height = cellWidth - 2*padding (square aspect).
  const imgPx = Math.max(0, columnWidthPx - padding * 2);
  // Cell content layout: padding-top + img + mb-3 + text-block + padding-bottom.
  // Plus `gap` so the per-cell paddingTop/Bottom inset (halfGap each on
  // non-edge rows) doesn't eat from the button's h-full and clip the text.
  const cellOuterHeight = imgPx + padding * 2 + IMG_TEXT_GAP_PX + ROW_HEIGHT_TEXT_BLOCK + gap;

  const rowCount = columnCount > 0 ? Math.ceil(filteredAlbums.length / columnCount) : 0;

  // Restore scroll position after the grid has laid out cells. Run once after
  // we know the container width (Grid only scrolls correctly once measured).
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (didRestoreScroll.current) return;
    if (containerWidth <= 0) return;
    if (savedScrollTop.current <= 0) {
      didRestoreScroll.current = true;
      return;
    }
    const el = gridRef.current?.element;
    if (el) {
      el.scrollTop = savedScrollTop.current;
      didRestoreScroll.current = true;
    }
  }, [containerWidth]);

  const cellProps = useMemo(
    () => ({
      albums: filteredAlbums,
      columnCount,
      gap,
      onAlbumClick: handleAlbumClick,
      cardPaddingClass,
      imgPx,
      trackCountLabel,
    }),
    [filteredAlbums, columnCount, gap, handleAlbumClick, cardPaddingClass, imgPx, trackCountLabel]
  );

  return {
    containerRef,
    gridRef,
    isEmpty: filteredAlbums.length === 0,
    isReturning: isReturning.current,
    showFilterCount: searchQuery.trim().length > 0,
    filterCountLabel: t('albumFilterCount', {
      filtered: filteredAlbums.length,
      total: albums.length,
    }),
    emptyTitle: t('noMatchesTitle'),
    emptySubtitle: t('noMatchesSubtitle'),
    columnCount,
    rowCount,
    columnWidthPx,
    cellOuterHeight,
    showGrid: columnCount > 0 && containerWidth > 0,
    cellProps,
  };
}
