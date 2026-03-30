import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { Music, Search, X, Download } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { motion, AnimatePresence } from 'motion/react';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';

export function LibraryView() {
  const { t } = useTranslation('library');
  const library = usePlayerStore(s => s.library);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const ambientColor = useAmbientColor();
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Now Playing Hero */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="px-6 pb-4 shrink-0 overflow-hidden"
          >
            <div
              className="relative rounded-2xl overflow-hidden p-5 flex items-center gap-5"
              style={{
                background: `linear-gradient(135deg, rgba(${ambientColor.rgb}, 0.15) 0%, rgba(${ambientColor.rgb}, 0.05) 100%)`,
              }}
            >
              {/* Blurred album art background */}
              {currentTrack.albumArt && (
                <div
                  className="absolute inset-0 opacity-[0.08] blur-2xl scale-110"
                  style={{ backgroundImage: `url(${currentTrack.albumArt})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTrack.id}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 250 }}
                  className="w-24 h-24 rounded-xl overflow-hidden shadow-2xl shadow-black/30 shrink-0 bg-muted flex items-center justify-center"
                >
                  {currentTrack.albumArt ? (
                    <img src={currentTrack.albumArt} alt={currentTrack.title} className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="relative min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium mb-1">{t('nowPlaying', { ns: 'common' })}</p>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentTrack.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="font-display text-lg font-semibold text-foreground truncate">{currentTrack.title}</h2>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{currentTrack.artist} — {currentTrack.album}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search bar */}
      {library.length > 0 && (
        <div className="px-6 pt-4 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('filterPlaceholder')}
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
          {isFiltered && (
            <p className="text-xs text-muted-foreground/50 mt-1.5 px-1">
              {t('filterCount', { filtered: filteredLibrary.length, total: library.length })}
            </p>
          )}
        </div>
      )}

      {/* Track list */}
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
          <List
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
