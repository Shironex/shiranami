import { Download, LayoutGrid, List, Music, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { List as VirtualList } from 'react-window';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { GridSizeToggle } from '@/components/shared/GridSizeToggle';
import { AlbumSortControl } from '@/components/shared/AlbumSortControl';
import { Input } from '@/components/ui/input';
import { AlbumGrid } from '../AlbumGrid';
import { AlbumDetailView } from '../AlbumDetailView';
import { ViewModeButton } from '../ViewModeButton';
import { useLibraryView } from './LibraryView.hooks';
import { LibraryViewSkeleton } from './LibraryViewSkeleton';

export default function LibraryView() {
  const {
    t,
    showSkeleton,
    showAlbumDetail,
    library,
    filteredLibrary,
    heroCardEnabled,
    hasSelection,
    searchInputRef,
    searchQuery,
    searchPlaceholder,
    isFiltered,
    isAlbumsMode,
    isTracksMode,
    isLibraryEmpty,
    hasNoMatches,
    showTrackFilterCount,
    trackFilterCountLabel,
    rowProps,
    albumGridSize,
    albumSortMode,
    albumSortOrder,
    albumSortLabels,
    gridSizeLabels,
    onViewModeChange,
    onSearchChange,
    onClearSearch,
    onAlbumGridSizeChange,
    onAlbumSortModeChange,
    onAlbumSortOrderChange,
    onKeyDown,
  } = useLibraryView();

  // If an album is selected in albums mode, show the detail view.
  if (showAlbumDetail) {
    return <AlbumDetailView />;
  }

  if (showSkeleton) {
    return <LibraryViewSkeleton />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onKeyDown={onKeyDown} tabIndex={-1}>
      <PageHeader title={t('pageTitle')} />

      {heroCardEnabled && <NowPlayingHero />}

      {/* Search bar + view toggle */}
      {library.length > 0 && (
        <div className="px-6 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/55 pointer-events-none" />
              <Input
                ref={searchInputRef}
                data-testid="library-search-input"
                type="text"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-auto w-full pl-10 pr-9 py-2.5 rounded-xl text-sm glass-subtle border-border/40 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/40 focus-visible:border-primary/40 shadow-none"
              />
              <AnimatePresence>
                {isFiltered && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.1 }}
                    onClick={onClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Album-only controls: sort + grid size. The detail view short-circuits
                above, so rendering these only for 'albums' mode is enough. */}
            {isAlbumsMode && (
              <>
                <AlbumSortControl
                  mode={albumSortMode}
                  order={albumSortOrder}
                  onModeChange={onAlbumSortModeChange}
                  onOrderChange={onAlbumSortOrderChange}
                  labels={albumSortLabels}
                />

                <GridSizeToggle
                  size={albumGridSize}
                  onSizeChange={onAlbumGridSizeChange}
                  labels={gridSizeLabels}
                />
              </>
            )}

            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-border/50 glass-subtle p-1 gap-0.5">
              <ViewModeButton
                active={isTracksMode}
                onClick={() => onViewModeChange('tracks')}
                icon={List}
                label={t('viewTracks')}
              />
              <ViewModeButton
                active={isAlbumsMode}
                onClick={() => onViewModeChange('albums')}
                icon={LayoutGrid}
                label={t('viewAlbums')}
              />
            </div>
          </div>
          {showTrackFilterCount && (
            <p className="text-xs text-muted-foreground/50 mt-1.5 px-1">{trackFilterCountLabel}</p>
          )}
        </div>
      )}

      {/* Content */}
      {isLibraryEmpty ? (
        <ViewEmptyState
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={Music}
          hints={[
            { icon: Search, label: t('emptyHintSearch') },
            { icon: Download, label: t('emptyHintImport') },
          ]}
        />
      ) : isAlbumsMode ? (
        <AlbumGrid library={library} searchQuery={searchQuery} />
      ) : hasNoMatches ? (
        <ViewEmptyState
          compact
          icon={Search}
          title={t('noMatchesTitle')}
          subtitle={t('noMatchesSubtitle')}
        />
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2 py-1.5">
            <VirtualList
              rowCount={filteredLibrary.length}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={TrackRow}
              rowProps={rowProps}
            />
          </div>
        </div>
      )}

      {hasSelection && <BulkActionBar trackList={filteredLibrary} />}
    </div>
  );
}
