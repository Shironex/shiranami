import { Search } from 'lucide-react';
import { motion } from 'motion/react';
import { Grid, type GridImperativeAPI } from 'react-window';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { AlbumCell } from './AlbumCell';
import { useAlbumGrid } from './AlbumGrid.hooks';
import type { IAlbumGridProps } from './AlbumGrid.types';

export default function AlbumGrid({ library, searchQuery }: IAlbumGridProps) {
  const {
    containerRef,
    gridRef,
    isEmpty,
    isReturning,
    showFilterCount,
    filterCountLabel,
    emptyTitle,
    emptySubtitle,
    columnCount,
    rowCount,
    columnWidthPx,
    cellOuterHeight,
    showGrid,
    cellProps,
  } = useAlbumGrid({ library, searchQuery });

  if (isEmpty) {
    return <ViewEmptyState compact icon={Search} title={emptyTitle} subtitle={emptySubtitle} />;
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden px-6 pb-4 flex flex-col">
      {showFilterCount && (
        <p className="text-xs text-muted-foreground/50 mb-3 px-1 shrink-0">{filterCountLabel}</p>
      )}
      <motion.div
        className="flex-1 min-h-0 scrollbar-thin"
        initial={isReturning ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ height: '100%' }}
      >
        {showGrid && (
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
