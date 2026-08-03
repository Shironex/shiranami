import { AlertCircle, Disc3, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { GreetingHero } from '@/components/overview/GreetingHero';
import { WeeklyRecapCard } from '@/components/shared/WeeklyRecapCard';
import { StatStrip } from '@/components/overview/StatStrip';
import { TopThisWeek } from '@/components/overview/TopThisWeek';
import { ListeningClock } from '@/components/overview/ListeningClock';
import { TopAlbums } from '@/components/overview/TopAlbums';
import { RecentlyAdded } from '@/components/overview/RecentlyAdded';
import { RecommendationsShelf } from '@/components/overview/RecommendationsShelf';
import { SmartMixesShelf } from '@/components/overview/SmartMixesShelf';
import { useOverviewView } from './OverviewView.hooks';
import { OverviewViewSkeleton } from './OverviewViewSkeleton';

/**
 * Overview dashboard — the landing view. Composition root that assembles the
 * greeting hero, stat strip, listening insights, smart mixes, recommendations,
 * and the recently-added rail, gated by the interface store's section toggles.
 */
export default function OverviewView() {
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
    recap,
    showRecap,
    showStats,
    showTopWeek,
    showClock,
    showTopAlbums,
    showMixes,
    showRecommendations,
    showRightColumn,
    showWeekGrid,
    showRecents,
    copy,
    handlePlayTrack,
    onRetry,
    onOpenFolder,
    onNavigateLibrary,
    onNavigateHistory,
  } = useOverviewView();

  // The week's recap appears on its own after a week completes, then folds
  // itself away into the History archive a few days later.
  const recapCard =
    showRecap && recap ? <WeeklyRecapCard recap={recap} onOpenArchive={onNavigateHistory} /> : null;

  if (isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={copy.errorTitle}
        subtitle={copy.errorSubtitle}
        icon={AlertCircle}
        action={{ label: copy.retryLabel, onClick: onRetry }}
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
        title={copy.firstRunTitle}
        subtitle={copy.firstRunSubtitle}
        icon={LayoutDashboard}
        action={{ label: copy.firstRunAction, onClick: onOpenFolder }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="flex w-full flex-col gap-6 px-6 pb-10 pt-6">
        <GreetingHero />

        {recapCard}

        {hasHistory ? (
          <>
            {showStats && (
              <StatStrip
                summary={summary}
                newInLibraryCount={newInLibraryCount}
                trendDeltaMinutes={trendDeltaMinutes}
                sessionCount={sessionCount}
              />
            )}

            {showWeekGrid && (
              <div
                className={cn(
                  'grid gap-6',
                  showTopWeek && showRightColumn && 'xl:grid-cols-[1.3fr_1fr]'
                )}
              >
                {showTopWeek && (
                  <TopThisWeek
                    tracks={summary.topTracks}
                    onPlay={handlePlayTrack}
                    onOpenLibrary={onNavigateLibrary}
                  />
                )}
                {showRightColumn && (
                  <div className="flex flex-col gap-6">
                    {showClock && <ListeningClock heatmap={heatmap} />}
                    {showTopAlbums && <TopAlbums albums={topAlbums} />}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <ViewEmptyState
            compact
            title={copy.emptySectionTitle}
            subtitle={copy.emptySectionCopy}
            icon={Disc3}
          />
        )}

        {showMixes && <SmartMixesShelf />}

        {showRecommendations && (
          <RecommendationsShelf onPlay={handlePlayTrack} hasLibrary={hasLibrary} />
        )}

        {showRecents && <RecentlyAdded tracks={recentlyAdded} onPlay={handlePlayTrack} />}
      </div>
    </div>
  );
}
