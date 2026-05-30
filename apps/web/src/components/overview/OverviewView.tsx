import { useTranslation } from 'react-i18next';
import { AlertCircle, Disc3, LayoutDashboard } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useViewStore } from '@/stores/useViewStore';
import { useOverviewData } from '@/hooks/useOverviewData';
import { GreetingHero } from '@/components/overview/GreetingHero';
import { StatStrip } from '@/components/overview/StatStrip';
import { TopThisWeek } from '@/components/overview/TopThisWeek';
import { ListeningClock } from '@/components/overview/ListeningClock';
import { TopAlbums } from '@/components/overview/TopAlbums';
import { RecentlyAdded } from '@/components/overview/RecentlyAdded';
import { RecommendationsShelf } from '@/components/overview/RecommendationsShelf';
import { SmartMixesShelf } from '@/components/overview/SmartMixesShelf';
import { OverviewViewSkeleton } from '@/components/overview/OverviewViewSkeleton';

export default function OverviewView() {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');
  const {
    summary,
    heatmap,
    topAlbums,
    sessionCount,
    trendDeltaMinutes,
    recentlyAdded,
    newInLibraryCount,
    hasLibrary,
    hasHistory,
    libraryLoaded,
    isLoading,
    isError,
    refetch,
    handlePlayTrack,
  } = useOverviewData();
  const { handleOpenFolder } = useLibraryActions();
  const navigateTo = useViewStore(s => s.navigateTo);

  if (isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={t('errorTitle')}
        subtitle={t('errorSubtitle')}
        icon={AlertCircle}
        action={{
          label: tCommon('retry'),
          onClick: () => {
            void refetch();
          },
        }}
      />
    );
  }

  if (isLoading || !libraryLoaded) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <OverviewViewSkeleton />
      </div>
    );
  }

  // First run, no music at all: the hero/clock would float over empty panels,
  // so show a single welcoming empty state instead. Overview is the landing
  // view, so this is effectively the new-user surface.
  if (!hasLibrary) {
    return (
      <ViewEmptyState
        title={t('firstRunTitle')}
        subtitle={t('firstRunSubtitle')}
        icon={LayoutDashboard}
        action={{ label: t('firstRunAction'), onClick: () => void handleOpenFolder() }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="flex w-full flex-col gap-6 px-6 pb-10 pt-6">
        <GreetingHero />

        {hasHistory ? (
          <>
            <StatStrip
              summary={summary}
              newInLibraryCount={newInLibraryCount}
              trendDeltaMinutes={trendDeltaMinutes}
              sessionCount={sessionCount}
            />

            <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
              <TopThisWeek
                tracks={summary.topTracks}
                onPlay={handlePlayTrack}
                onOpenLibrary={() => navigateTo('library')}
              />
              <div className="flex flex-col gap-6">
                <ListeningClock heatmap={heatmap} />
                <TopAlbums albums={topAlbums} />
              </div>
            </div>
          </>
        ) : (
          <ViewEmptyState
            compact
            title={t('emptySectionTitle')}
            subtitle={t('emptySectionCopy')}
            icon={Disc3}
          />
        )}

        <SmartMixesShelf />

        <RecommendationsShelf onPlay={handlePlayTrack} hasLibrary={hasLibrary} />

        {recentlyAdded.length > 0 && (
          <RecentlyAdded tracks={recentlyAdded} onPlay={handlePlayTrack} />
        )}
      </div>
    </div>
  );
}
