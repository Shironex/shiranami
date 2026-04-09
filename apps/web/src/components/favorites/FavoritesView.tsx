import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { Heart } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { List } from 'react-window';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';

const showIfFavorite = (track: { isFavorite?: boolean }) => !!track.isFavorite;

export function FavoritesView() {
  const { t } = useTranslation('favorites');
  const library = usePlayerStore(s => s.library);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const setQueue = usePlayerStore(s => s.setQueue);
  const toggleFavorite = usePlayerStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const libraryHeroCardEnabled = useAppStore(s => s.libraryHeroCardEnabled);

  const favorites = useMemo(
    () => library.filter((t) => t.isFavorite),
    [library]
  );

  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const handlePlayTrack = useCallback(
    (favIndex: number) => {
      setQueue(favoritesRef.current, favIndex);
    },
    [setQueue]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {libraryHeroCardEnabled && <NowPlayingHero show={showIfFavorite} />}

      {favorites.length === 0 ? (
        <ViewEmptyState
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={Heart}
        />
      ) : (
        <div className="flex-1 min-h-0 px-4">
          <List
            rowCount={favorites.length}
            rowHeight={52}
            overscanCount={10}
            className="scrollbar-thin"
            style={{ height: '100%' }}
            rowComponent={TrackRow}
            rowProps={{ queue: favorites, currentTrack, isPlaying, handlePlayTrack, onToggleFavorite: toggleFavorite, showAddToPlaylist: true }}
          />
        </div>
      )}

      {hasSelection && <BulkActionBar trackList={favorites} />}
    </div>
  );
}
