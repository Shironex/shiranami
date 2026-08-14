import { AlertCircle, BarChart3, Clock3, Disc3 } from 'lucide-react';
import { StaggerList } from '@/components/shared/StaggerList';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { HistoryActivityGraph } from '@/components/history/HistoryActivityGraph';
import { HistoryEmptyState } from '@/components/history/HistoryEmptyState';
import { HistoryHeroSection } from '@/components/history/HistoryHeroSection';
import { HistoryTopTrackRow } from '@/components/history/HistoryTopTrackRow';
import { HistoryTopArtistRow } from '@/components/history/HistoryTopArtistRow';
import { HistoryRecentRow } from '@/components/history/HistoryRecentRow';
import { RecapShelf } from '@/components/history/RecapShelf';
import { HistoryStatCard } from './HistoryStatCard';
import { HistoryViewSkeleton } from './HistoryViewSkeleton';
import { StatsSection } from './StatsSection';
import { useHistoryView } from './HistoryView.hooks';

export default function HistoryView() {
  const view = useHistoryView();

  if (view.isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={view.errorTitle}
        subtitle={view.errorSubtitle}
        icon={AlertCircle}
        action={{ label: view.retryLabel, onClick: view.onRetry }}
      />
    );
  }

  if (view.isLoading) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <HistoryViewSkeleton />
      </div>
    );
  }

  const statCards = view.stats.map(stat => (
    <HistoryStatCard
      key={stat.key}
      label={stat.label}
      value={stat.value}
      hint={stat.hint}
      icon={stat.icon}
    />
  ));

  const topTrackRows = view.topTracks.map(track => (
    <HistoryTopTrackRow key={track.trackId} track={track} onPlay={view.onPlayTrack} />
  ));

  const topArtistRows = view.topArtists.map(artist => (
    <HistoryTopArtistRow key={artist.artist} artist={artist} />
  ));

  const recentRows = view.recent.map(entry => (
    <HistoryRecentRow key={entry.id} entry={entry} onPlay={view.onPlayTrack} />
  ));

  const hasTopTracks = view.topTracks.length > 0;
  const hasTopArtists = view.topArtists.length > 0;
  const hasRecent = view.recent.length > 0;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="flex w-full flex-col gap-6 px-6 pb-10 pt-6">
        <HistoryHeroSection selectedRange={view.selectedRange} onRangeChange={view.onRangeChange} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{statCards}</div>

        {/* The activity graph is the page's focal panel — the hero treatment
            keeps the list panels below reading as supporting detail. */}
        <StatsSection
          variant="hero"
          title={view.activityTitle}
          caption={view.activityCaption}
          icon={BarChart3}
        >
          <div className="mt-5">
            <HistoryActivityGraph points={view.activitySeries} range={view.selectedRange} />
          </div>
        </StatsSection>

        {/* Past weeks' recaps, derived on demand — where Overview's card folds
            away to, and reachable without waiting for one. */}
        <RecapShelf />

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <StatsSection title={view.topTracksTitle} icon={Disc3}>
            <div className="mt-4 space-y-3">
              {hasTopTracks ? (
                topTrackRows
              ) : (
                <HistoryEmptyState title={view.noTopTracksTitle} copy={view.noTopTracksCopy} />
              )}
            </div>
          </StatsSection>

          <StatsSection title={view.topArtistsTitle} icon={BarChart3}>
            <div className="mt-4 space-y-3">
              {hasTopArtists ? (
                topArtistRows
              ) : (
                <HistoryEmptyState
                  title={view.noArtistTrendsTitle}
                  copy={view.noArtistTrendsCopy}
                />
              )}
            </div>
          </StatsSection>
        </div>

        <StatsSection title={view.recentTitle} icon={Clock3}>
          <div className="mt-4">
            {!hasRecent ? (
              <HistoryEmptyState title={view.noRecentPlaysTitle} copy={view.noRecentPlaysCopy} />
            ) : (
              <StaggerList className="space-y-3">{recentRows}</StaggerList>
            )}
          </div>
        </StatsSection>
      </div>
    </div>
  );
}
