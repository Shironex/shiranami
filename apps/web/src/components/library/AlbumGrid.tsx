import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { type Track } from '@/stores/types';
import { Disc3, Search } from 'lucide-react';
import { motion } from 'motion/react';
import {
  Grid,
  getScrollbarSize,
  type CellComponentProps,
  type GridImperativeAPI,
} from 'react-window';
import { groupTracksByAlbum, type AlbumData } from '@/lib/albumSort';

export type { AlbumData };

interface AlbumGridProps {
  library: Track[];
  searchQuery: string;
}

type GridSize = 'small' | 'medium' | 'large';

// Tailwind breakpoint columns mirrored in JS so Grid can compute layout. The
// non-virtualized version delegated to CSS grid, but Grid needs an explicit
// columnCount.
const COLUMN_COUNTS: Record<GridSize, ReadonlyArray<readonly [number, number]>> = {
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

function columnsFor(size: GridSize, viewportWidth: number): number {
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
const ROW_HEIGHT_TEXT_BLOCK = 64;
const GAP_PX: Record<GridSize, number> = { small: 8, medium: 12, large: 16 };
const PADDING_PX: Record<GridSize, number> = { small: 12, medium: 16, large: 16 };

interface CellProps {
  albums: AlbumData[];
  columnCount: number;
  gap: number;
  onAlbumClick: (name: string) => void;
  cardPaddingClass: string;
  imgPx: number;
  trackCountLabel: (count: number) => string;
}

function AlbumCell({
  columnIndex,
  rowIndex,
  style,
  albums,
  columnCount,
  gap,
  onAlbumClick,
  cardPaddingClass,
  imgPx,
  trackCountLabel,
}: CellComponentProps<CellProps>) {
  const index = rowIndex * columnCount + columnIndex;
  const album = albums[index];
  const halfGap = gap / 2;
  const insetStyle: React.CSSProperties = {
    ...style,
    paddingLeft: columnIndex === 0 ? 0 : halfGap,
    paddingRight: columnIndex === columnCount - 1 ? 0 : halfGap,
    paddingTop: rowIndex === 0 ? 0 : halfGap,
    paddingBottom: halfGap,
  };
  if (!album) {
    return <div style={insetStyle} aria-hidden="true" />;
  }
  return (
    <div style={insetStyle}>
      <button
        onClick={() => onAlbumClick(album.name)}
        className={`text-left ${cardPaddingClass} rounded-2xl bg-surface/60 border border-border/30 hover:border-border/60 hover:bg-surface transition-all duration-200 group w-full h-full flex flex-col`}
      >
        <div
          className="w-full rounded-xl bg-muted/30 flex items-center justify-center mb-3 overflow-hidden"
          style={{ height: imgPx, flexShrink: 0 }}
        >
          {album.albumArt ? (
            <img
              src={album.albumArt}
              alt={album.name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Disc3 className="w-10 h-10 text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors" />
          )}
        </div>
        <div
          style={{ height: ROW_HEIGHT_TEXT_BLOCK }}
          className="flex flex-col justify-start min-w-0"
        >
          <p className="font-display text-sm font-semibold text-foreground truncate">
            {album.name}
          </p>
          <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{album.artist}</p>
          <p className="text-[10px] text-muted-foreground/30 mt-1.5 truncate">
            {trackCountLabel(album.trackCount)}
          </p>
        </div>
      </button>
    </div>
  );
}

export function AlbumGrid({ library, searchQuery }: AlbumGridProps) {
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
    (albumName: string) => {
      const offset = gridRef.current?.element?.scrollTop ?? 0;
      setAlbumGridScrollTop(offset);
      selectAlbum(albumName);
    },
    [selectAlbum, setAlbumGridScrollTop, gridRef]
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
  const cellOuterHeight = imgPx + padding * 2 + ROW_HEIGHT_TEXT_BLOCK;

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
  }, [containerWidth, gridRef]);

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

  if (filteredAlbums.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <Search className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
        <div>
          <p className="font-display text-base font-medium text-muted-foreground">
            {t('noMatchesTitle')}
          </p>
          <p className="text-sm text-muted-foreground/50 mt-1">{t('noMatchesSubtitle')}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden px-6 pb-4 flex flex-col">
      {searchQuery.trim() && (
        <p className="text-xs text-muted-foreground/50 mb-3 px-1 shrink-0">
          {t('albumFilterCount', { filtered: filteredAlbums.length, total: albums.length })}
        </p>
      )}
      <motion.div
        className="flex-1 min-h-0 scrollbar-thin"
        initial={isReturning.current ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ height: '100%' }}
      >
        {columnCount > 0 && containerWidth > 0 && (
          <Grid
            gridRef={gridRef as React.RefObject<GridImperativeAPI>}
            cellComponent={AlbumCell}
            cellProps={cellProps}
            columnCount={columnCount}
            columnWidth={columnWidthPx}
            rowCount={rowCount}
            rowHeight={cellOuterHeight}
            overscanCount={2}
            className="scrollbar-thin"
            style={{ height: '100%' }}
          />
        )}
      </motion.div>
    </div>
  );
}
