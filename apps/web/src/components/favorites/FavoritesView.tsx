import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import { useUIStore } from '@/stores/useUIStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { Heart } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { FavoritesViewSkeleton } from './FavoritesViewSkeleton';

const showIfFavorite = (track: { isFavorite?: boolean }) => !!track.isFavorite;

export function FavoritesView() {
  const { t } = useTranslation('favorites');
  // Merged library so an in-session favorite toggle moves a track in or out
  // of the favorites filter immediately, without rewriting `library`.
  const library = useMergedLibrary();
  const libraryLoaded = useLibraryStore(s => s.libraryLoaded);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const libraryHeroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);

  const favorites = useMemo(() => library.filter(t => t.isFavorite), [library]);

  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const handlePlayTrack = useCallback(
    (favIndex: number) => {
      setQueue(favoritesRef.current, favIndex);
    },
    [setQueue]
  );

  // Cold-start skeleton: library hasn't loaded yet, so we can't tell whether
  // any favorites exist. Show skeleton rather than an empty-state flash.
  if (!libraryLoaded && library.length === 0) {
    return <FavoritesViewSkeleton />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />

      {libraryHeroCardEnabled && <NowPlayingHero show={showIfFavorite} />}

      {favorites.length === 0 ? (
        <ViewEmptyState title={t('emptyTitle')} subtitle={t('emptySubtitle')} icon={Heart} />
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2">
            <List
              rowCount={favorites.length}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={TrackRow}
              rowProps={{
                queue: favorites,
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

      {hasSelection && <BulkActionBar trackList={favorites} />}
    </div>
  );
}
