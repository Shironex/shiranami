import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import {
  useAppStore,
  type AlbumGridSize,
  type AlbumSortMode,
} from '@/stores/useAppStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  List,
  Music,
  Search,
  X,
} from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { motion, AnimatePresence } from 'motion/react';
import { List as VirtualList } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { AlbumGrid } from './AlbumGrid';
import { AlbumDetailView } from './AlbumDetailView';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function sortLabel(
  t: (key: string) => string,
  mode: AlbumSortMode,
): string {
  switch (mode) {
    case 'artist':
      return t('sortByArtist');
    case 'year':
      return t('sortByYear');
    case 'name':
    default:
      return t('sortByName');
  }
}

export function LibraryView() {
  const { t } = useTranslation('library');
  const library = usePlayerStore(s => s.library);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

  const libraryViewMode = useAppStore(s => s.libraryViewMode);
  const setLibraryViewMode = useAppStore(s => s.setLibraryViewMode);
  const selectedAlbumName = useAppStore(s => s.selectedAlbumName);
  const libraryHeroCardEnabled = useAppStore(s => s.libraryHeroCardEnabled);
  const albumGridSize = useAppStore(s => s.albumGridSize);
  const setAlbumGridSize = useAppStore(s => s.setAlbumGridSize);
  const albumSortMode = useAppStore(s => s.albumSortMode);
  const setAlbumSortMode = useAppStore(s => s.setAlbumSortMode);
  const albumSortOrder = useAppStore(s => s.albumSortOrder);
  const setAlbumSortOrder = useAppStore(s => s.setAlbumSortOrder);

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
  if (libraryViewMode === 'albums' && selectedAlbumName) {
    return <AlbumDetailView />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onKeyDown={handleKeyDown} tabIndex={-1}>
      {libraryHeroCardEnabled && <NowPlayingHero />}

      {/* Search bar + view toggle */}
      {library.length > 0 && (
        <div className="px-6 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={libraryViewMode === 'albums' ? t('filterAlbumsPlaceholder') : t('filterPlaceholder')}
                className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm bg-card border border-border/50 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
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
                {/* Sort control */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={t('sortBy')}
                      title={t('sortBy')}
                    >
                      <ArrowUpDown className="w-4 h-4" />
                      <span className="hidden sm:inline">{sortLabel(t, albumSortMode)}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-52">
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 px-1">
                        {t('sortBy')}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {(['name', 'artist', 'year'] as const).map(mode => (
                          <button
                            key={mode}
                            onClick={() => setAlbumSortMode(mode)}
                            className={cn(
                              'text-left px-2 py-1.5 rounded-md text-xs transition-colors',
                              albumSortMode === mode
                                ? 'bg-primary/15 text-primary'
                                : 'text-foreground/80 hover:bg-accent'
                            )}
                          >
                            {sortLabel(t, mode)}
                          </button>
                        ))}
                      </div>
                      <div className="h-px bg-border/40 my-1" />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAlbumSortOrder('asc')}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors',
                            albumSortOrder === 'asc'
                              ? 'bg-primary/15 text-primary'
                              : 'text-foreground/80 hover:bg-accent'
                          )}
                          aria-label={t('sortOrderAsc')}
                          title={t('sortOrderAsc')}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                          <span>{t('sortOrderAsc')}</span>
                        </button>
                        <button
                          onClick={() => setAlbumSortOrder('desc')}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors',
                            albumSortOrder === 'desc'
                              ? 'bg-primary/15 text-primary'
                              : 'text-foreground/80 hover:bg-accent'
                          )}
                          aria-label={t('sortOrderDesc')}
                          title={t('sortOrderDesc')}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                          <span>{t('sortOrderDesc')}</span>
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Grid size toggle */}
                <div
                  className="flex items-center rounded-xl border border-border/50 bg-card p-1 gap-0.5"
                  role="group"
                  aria-label={t('gridSize')}
                >
                  {([
                    { size: 'large', icon: Grid2x2, label: t('gridSizeLarge') },
                    { size: 'medium', icon: LayoutGrid, label: t('gridSizeMedium') },
                    { size: 'small', icon: Grid3x3, label: t('gridSizeSmall') },
                  ] as const).map(({ size, icon: Icon, label }) => (
                    <button
                      key={size}
                      onClick={() => setAlbumGridSize(size as AlbumGridSize)}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        albumGridSize === size
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground/50 hover:text-foreground'
                      )}
                      aria-label={label}
                      title={label}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-border/50 bg-card p-1 gap-0.5">
              <button
                onClick={() => setLibraryViewMode('tracks')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  libraryViewMode === 'tracks'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground/50 hover:text-foreground'
                )}
                aria-label={t('viewTracks')}
                title={t('viewTracks')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLibraryViewMode('albums')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  libraryViewMode === 'albums'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground/50 hover:text-foreground'
                )}
                aria-label={t('viewAlbums')}
                title={t('viewAlbums')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
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
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <Search className="w-12 h-12 text-muted-foreground/20" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base font-medium text-muted-foreground">{t('noMatchesTitle')}</p>
            <p className="text-sm text-muted-foreground/50 mt-1">{t('noMatchesSubtitle')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-4">
          <VirtualList
            rowCount={filteredLibrary.length}
            rowHeight={52}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={TrackRow}
            rowProps={{ queue: filteredLibrary, currentTrack, isPlaying, handlePlayTrack, onToggleFavorite: toggleFavorite, showAddToPlaylist: true }}
          />
        </div>
      )}

      {hasSelection && <BulkActionBar trackList={filteredLibrary} />}
    </div>
  );
}
