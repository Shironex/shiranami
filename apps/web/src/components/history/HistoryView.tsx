import { useTranslation } from 'react-i18next';
import { BarChart3, CheckCircle2, Clock3, Disc3, Music, PlayCircle } from 'lucide-react';
import { useListeningHistoryView } from '@/hooks/useListeningHistoryView';
import { formatTotalTime, getRangeCopy } from '@/components/history/historyUtils';
import { HistoryActivityGraph } from '@/components/history/HistoryActivityGraph';
import { HistoryEmptyState } from '@/components/history/HistoryEmptyState';
import { HistoryHeroSection } from '@/components/history/HistoryHeroSection';
import { HistoryStatCard } from '@/components/history/HistoryStatCard';
import { RecentRow, TopArtistRow, TopTrackRow } from '@/components/history/HistoryTrackRows';
import { HistoryViewSkeleton } from '@/components/history/HistoryViewSkeleton';

export default function HistoryView() {
  const { t } = useTranslation('history');
  const {
    selectedRange,
    setSelectedRange,
    summary,
    recent,
    activitySeries,
    isLoading,
    handlePlayTrack,
  } = useListeningHistoryView();

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <HistoryViewSkeleton />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10 pt-6">
        <HistoryHeroSection selectedRange={selectedRange} onRangeChange={setSelectedRange} />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <HistoryStatCard
            label={t('loggedPlays')}
            value={summary.totalPlays.toLocaleString()}
            hint={t('meaningfulListens', { range: getRangeCopy(selectedRange) })}
            icon={PlayCircle}
          />
          <HistoryStatCard
            label={t('listeningTime')}
            value={formatTotalTime(summary.totalMinutes)}
            hint={t('cumulativePlayback')}
            icon={Clock3}
          />
          <HistoryStatCard
            label={t('uniqueTracks')}
            value={summary.uniqueTracks.toLocaleString()}
            hint={t('uniqueTracksHint')}
            icon={Music}
          />
          <HistoryStatCard
            label={t('completedPlays')}
            value={summary.completedPlays.toLocaleString()}
            hint={t('completedPlaysHint')}
            icon={CheckCircle2}
          />
        </section>

        <section className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">{t('activity')}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/65">
            {t('dailyListens', { range: getRangeCopy(selectedRange).toLowerCase() })}
          </p>
          <div className="mt-5">
            <HistoryActivityGraph points={activitySeries} range={selectedRange} />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <div className="flex items-center gap-2">
              <Disc3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">{t('topTracks')}</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.topTracks.length > 0 ? (
                summary.topTracks.map((track) => (
                  <TopTrackRow key={track.trackId} track={track} onPlay={handlePlayTrack} />
                ))
              ) : (
                <HistoryEmptyState
                  title={t('noTopTracksTitle')}
                  copy={t('noTopTracksCopy')}
                />
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">{t('topArtists')}</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.topArtists.length > 0 ? (
                summary.topArtists.map((artist) => (
                  <TopArtistRow key={artist.artist} artist={artist} />
                ))
              ) : (
                <HistoryEmptyState
                  title={t('noArtistTrendsTitle')}
                  copy={t('noArtistTrendsCopy')}
                />
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">{t('recentPlays')}</h2>
          </div>
          <div className="mt-4 space-y-3">
            {recent.length > 0 ? (
              recent.map((entry) => (
                <RecentRow key={entry.id} entry={entry} onPlay={handlePlayTrack} />
              ))
            ) : (
              <HistoryEmptyState
                title={t('noRecentPlaysTitle')}
                copy={t('noRecentPlaysCopy')}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
