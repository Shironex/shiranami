import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { Music, Search, X, Download, List, LayoutGrid } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { motion, AnimatePresence } from 'motion/react';
import { List as VirtualList } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { AlbumGrid } from './AlbumGrid';
import { AlbumDetailView } from './AlbumDetailView';
import { cn } from '@/lib/utils';

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
      <NowPlayingHero />

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

            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border/50 bg-card p-0.5">
              <button
                onClick={() => setLibraryViewMode('tracks')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
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
                  'p-1.5 rounded-md transition-colors',
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
