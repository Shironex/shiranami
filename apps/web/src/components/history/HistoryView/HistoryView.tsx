import { AlertCircle, BarChart3, Clock3, Disc3 } from 'lucide-react';
import { StaggerList } from '@/components/shared/StaggerList';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { HistoryActivityGraph } from '@/components/history/HistoryActivityGraph';
import { HistoryEmptyState } from '@/components/history/HistoryEmptyState';
import { HistoryHeroSection } from '@/components/history/HistoryHeroSection';
import { HistoryTopTrackRow } from '@/components/history/HistoryTopTrackRow';
import { HistoryTopArtistRow } from '@/components/history/HistoryTopArtistRow';
import { HistoryRecentRow } from '@/components/history/HistoryRecentRow';
import { HistoryStatCard } from './HistoryStatCard';
import { HistoryViewSkeleton } from './HistoryViewSkeleton';
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{statCards}</section>

        <section className="rounded-[24px] border border-border/25 glass-panel p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">
              {view.activityTitle}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/65">{view.activityCaption}</p>
          <div className="mt-5">
            <HistoryActivityGraph points={view.activitySeries} range={view.selectedRange} />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-border/25 glass-panel p-4">
            <div className="flex items-center gap-2">
              <Disc3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">
                {view.topTracksTitle}
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {hasTopTracks ? (
                topTrackRows
              ) : (
                <HistoryEmptyState title={view.noTopTracksTitle} copy={view.noTopTracksCopy} />
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-border/25 glass-panel p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">
                {view.topArtistsTitle}
              </h2>
            </div>
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
          </div>
        </section>

        <section className="rounded-[24px] border border-border/25 glass-panel p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">
              {view.recentTitle}
            </h2>
          </div>
          <div className="mt-4">
            {!hasRecent ? (
              <HistoryEmptyState title={view.noRecentPlaysTitle} copy={view.noRecentPlaysCopy} />
            ) : (
              <StaggerList className="space-y-3">{recentRows}</StaggerList>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
