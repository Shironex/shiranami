import { Fragment, type ReactNode } from 'react';
import { AlertCircle, Disc3, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OverviewSectionId } from '@/lib/overview-sections';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { GreetingHero } from '@/components/overview/GreetingHero';
import { WeeklyRecapCard } from '@/components/shared/WeeklyRecapCard';
import { OnThisNightCard } from '@/components/overview/OnThisNightCard';
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
 * Sections that only make sense once plays exist. Without history they all
 * collapse into one compact empty state, anchored at the first of them in the
 * user's order.
 */
const HISTORY_GATED_SECTIONS: ReadonlySet<OverviewSectionId> = new Set(['stats', 'insights']);

/**
 * Overview dashboard — the landing view. Composition root that assembles the
 * greeting hero, stat strip, listening insights, smart mixes, recommendations,
 * and the recently-added rail, in the interface store's persisted section
 * order and gated by its section toggles.
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
    memory,
    showMemories,
    sectionOrder,
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

  const sectionNodes: Record<OverviewSectionId, ReactNode> = {
    // The week's recap appears on its own after a week completes, then folds
    // itself away into the History archive a few days later.
    recap:
      showRecap && recap ? (
        <WeeklyRecapCard recap={recap} onOpenArchive={onNavigateHistory} />
      ) : null,

    // An anniversary memory needs no recent history — a year-old night still
    // deserves its card — so it sits outside the hasHistory gate and simply
    // stays away when both lookback windows are silent.
    memories:
      showMemories && memory ? <OnThisNightCard memory={memory} onPlay={handlePlayTrack} /> : null,

    stats:
      hasHistory && showStats ? (
        <StatStrip
          summary={summary}
          newInLibraryCount={newInLibraryCount}
          trendDeltaMinutes={trendDeltaMinutes}
          sessionCount={sessionCount}
        />
      ) : null,

    insights:
      hasHistory && showWeekGrid ? (
        <div
          className={cn('grid gap-6', showTopWeek && showRightColumn && 'xl:grid-cols-[1.3fr_1fr]')}
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
      ) : null,

    mixes: showMixes ? <SmartMixesShelf /> : null,

    recommendations: showRecommendations ? (
      <RecommendationsShelf onPlay={handlePlayTrack} hasLibrary={hasLibrary} />
    ) : null,

    recentlyAdded: showRecents ? (
      <RecentlyAdded tracks={recentlyAdded} onPlay={handlePlayTrack} />
    ) : null,
  };

  const emptyStateAnchor = hasHistory
    ? null
    : (sectionOrder.find(id => HISTORY_GATED_SECTIONS.has(id)) ?? null);

  const orderedSections = sectionOrder.map(id =>
    id === emptyStateAnchor ? (
      <ViewEmptyState
        key={id}
        compact
        title={copy.emptySectionTitle}
        subtitle={copy.emptySectionCopy}
        icon={Disc3}
      />
    ) : (
      <Fragment key={id}>{sectionNodes[id]}</Fragment>
    )
  );

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="flex w-full flex-col gap-6 px-6 pb-10 pt-6">
        <GreetingHero />
        {orderedSections}
      </div>
    </div>
  );
}
