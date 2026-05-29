import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { Download, LayoutGrid, List, Music, Search, X } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { motion, AnimatePresence } from 'motion/react';
import { List as VirtualList } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { AlbumGrid } from './AlbumGrid';
import { AlbumDetailView } from './AlbumDetailView';
import { ViewModeButton } from './ViewModeButton';
import { GridSizeToggle } from '@/components/shared/GridSizeToggle';
import { AlbumSortControl } from '@/components/shared/AlbumSortControl';
import { LibraryViewSkeleton } from './LibraryViewSkeleton';
import { Input } from '@/components/ui/input';

export function LibraryView() {
  const { t } = useTranslation('library');
  const library = useLibraryStore(s => s.library);
  const libraryLoaded = useLibraryStore(s => s.libraryLoaded);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

  const libraryViewMode = useUIStore(s => s.libraryViewMode);
  const setLibraryViewMode = useUIStore(s => s.setLibraryViewMode);
  const selectedAlbumKey = useViewStore(s => s.selectedAlbumKey);
  const libraryHeroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);
  const albumGridSize = useUIStore(s => s.albumGridSize);
  const setAlbumGridSize = useUIStore(s => s.setAlbumGridSize);
  const albumSortMode = useUIStore(s => s.albumSortMode);
  const setAlbumSortMode = useUIStore(s => s.setAlbumSortMode);
  const albumSortOrder = useUIStore(s => s.albumSortOrder);
  const setAlbumSortOrder = useUIStore(s => s.setAlbumSortOrder);

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return library;
    const q = searchQuery.toLowerCase();
    return library.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [library, searchQuery]);

  const filteredRef = useRef(filteredLibrary);
  filteredRef.current = filteredLibrary;

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(filteredRef.current, index);
    },
    [setQueue]
  );

  // Ctrl+F / Cmd+F focuses the search input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  const isFiltered = searchQuery.trim().length > 0;

  // If an album is selected in albums mode, show the detail view
  if (libraryViewMode === 'albums' && selectedAlbumKey) {
    return <AlbumDetailView />;
  }

  // Cold-start skeleton: the initial library query is still in flight and we
  // have no cached tracks yet. Don't flash the empty-state hero.
  if (!libraryLoaded && library.length === 0) {
    return <LibraryViewSkeleton />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onKeyDown={handleKeyDown} tabIndex={-1}>
      <PageHeader title={t('pageTitle')} />

      {libraryHeroCardEnabled && <NowPlayingHero />}

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
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  libraryViewMode === 'albums'
                    ? t('filterAlbumsPlaceholder')
                    : t('filterPlaceholder')
                }
                aria-label={
                  libraryViewMode === 'albums'
                    ? t('filterAlbumsPlaceholder')
                    : t('filterPlaceholder')
                }
                className="h-auto w-full pl-10 pr-9 py-2.5 rounded-xl text-sm glass-subtle border-border/40 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/40 focus-visible:border-primary/40 shadow-none"
              />
              <AnimatePresence>
                {isFiltered && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.1 }}
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Album-only controls: sort + grid size. The detail view short-circuits
                above, so rendering these only for 'albums' mode is enough. */}
            {libraryViewMode === 'albums' && (
              <>
                <AlbumSortControl
                  mode={albumSortMode}
                  order={albumSortOrder}
                  onModeChange={setAlbumSortMode}
                  onOrderChange={setAlbumSortOrder}
                  labels={{
                    button: t('sortBy'),
                    modeName: t('sortByName'),
                    modeArtist: t('sortByArtist'),
                    modeYear: t('sortByYear'),
                    modeRecentlyAdded: t('sortByRecentlyAdded'),
                    orderAsc: t('sortOrderAsc'),
                    orderDesc: t('sortOrderDesc'),
                  }}
                />

                <GridSizeToggle
                  size={albumGridSize}
                  onSizeChange={setAlbumGridSize}
                  labels={{
                    group: t('gridSize'),
                    small: t('gridSizeSmall'),
                    medium: t('gridSizeMedium'),
                    large: t('gridSizeLarge'),
                  }}
                />
              </>
            )}

            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-border/50 glass-subtle p-1 gap-0.5">
              <ViewModeButton
                active={libraryViewMode === 'tracks'}
                onClick={() => setLibraryViewMode('tracks')}
                icon={List}
                label={t('viewTracks')}
              />
              <ViewModeButton
                active={libraryViewMode === 'albums'}
                onClick={() => setLibraryViewMode('albums')}
                icon={LayoutGrid}
                label={t('viewAlbums')}
              />
            </div>
          </div>
          {isFiltered && libraryViewMode === 'tracks' && (
            <p className="text-xs text-muted-foreground/50 mt-1.5 px-1">
              {t('filterCount', { filtered: filteredLibrary.length, total: library.length })}
            </p>
          )}
        </div>
      )}

      {/* Content */}
      {library.length === 0 ? (
        <ViewEmptyState
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={Music}
          hints={[
            { icon: Search, label: t('emptyHintSearch') },
            { icon: Download, label: t('emptyHintImport') },
          ]}
        />
      ) : libraryViewMode === 'albums' ? (
        <AlbumGrid library={library} searchQuery={searchQuery} />
      ) : filteredLibrary.length === 0 ? (
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
              rowProps={{
                queue: filteredLibrary,
                currentTrack,
                isPlaying,
                handlePlayTrack,
                onToggleFavorite: toggleFavorite,
                showAddToPlaylist: true,
              }}
            />
          </div>
        </div>
      )}

      {hasSelection && <BulkActionBar trackList={filteredLibrary} />}
    </div>
  );
}
