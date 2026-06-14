import { Heart } from 'lucide-react';
import { List } from 'react-window';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { NowPlayingHero } from '@/components/shared/NowPlayingHero';
import { TrackRow } from '@/components/shared/TrackRow';
import { BulkActionBar } from '@/components/shared/BulkActionBar';
import { useFavoritesView } from './FavoritesView.hooks';
import { FavoritesViewSkeleton } from './FavoritesViewSkeleton';

const showIfFavorite = (track: { isFavorite?: boolean }) => !!track.isFavorite;

export default function FavoritesView() {
  const view = useFavoritesView();

  if (view.showSkeleton) {
    return <FavoritesViewSkeleton />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={view.t('pageTitle')} />

      {view.libraryHeroCardEnabled && <NowPlayingHero show={showIfFavorite} />}

      {view.isEmpty ? (
        <ViewEmptyState
          title={view.t('emptyTitle')}
          subtitle={view.t('emptySubtitle')}
          icon={Heart}
        />
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="h-full px-2 py-1.5">
            <List
              rowCount={view.favorites.length}
              rowHeight={52}
              overscanCount={10}
              className="scrollbar-thin"
              style={{ height: '100%' }}
              rowComponent={TrackRow}
              rowProps={view.rowProps}
            />
          </div>
        </div>
      )}

      {view.hasSelection && <BulkActionBar trackList={view.favorites} />}
    </div>
  );
}
