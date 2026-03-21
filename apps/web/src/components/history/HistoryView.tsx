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
            label="Logged Plays"
            value={summary.totalPlays.toLocaleString()}
            hint={`${getRangeCopy(selectedRange)} meaningful listens`}
            icon={PlayCircle}
          />
          <HistoryStatCard
            label="Listening Time"
            value={formatTotalTime(summary.totalMinutes)}
            hint="Cumulative logged playback"
            icon={Clock3}
          />
          <HistoryStatCard
            label="Unique Tracks"
            value={summary.uniqueTracks.toLocaleString()}
            hint="Songs that made this range"
            icon={Music}
          />
          <HistoryStatCard
            label="Completed Plays"
            value={summary.completedPlays.toLocaleString()}
            hint="Sessions finished at 95%+"
            icon={CheckCircle2}
          />
        </section>

        <section className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">Activity</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/65">
            Daily listens across {getRangeCopy(selectedRange).toLowerCase()}.
          </p>
          <div className="mt-5">
            <HistoryActivityGraph points={activitySeries} range={selectedRange} />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <div className="flex items-center gap-2">
              <Disc3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">Top Tracks</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.topTracks.length > 0 ? (
                summary.topTracks.map((track) => (
                  <TopTrackRow key={track.trackId} track={track} onPlay={handlePlayTrack} />
                ))
              ) : (
                <HistoryEmptyState
                  title="No top tracks in this range"
                  copy="Once enough listens are logged in the selected period, your most-played tracks will surface here."
                />
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">Top Artists</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.topArtists.length > 0 ? (
                summary.topArtists.map((artist) => (
                  <TopArtistRow key={artist.artist} artist={artist} />
                ))
              ) : (
                <HistoryEmptyState
                  title="No artist trends yet"
                  copy="Your most-played artists will show up here as soon as the selected range has enough history."
                />
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">Recent Plays</h2>
          </div>
          <div className="mt-4 space-y-3">
            {recent.length > 0 ? (
              recent.map((entry) => (
                <RecentRow key={entry.id} entry={entry} onPlay={handlePlayTrack} />
              ))
            ) : (
              <HistoryEmptyState
                title="No recent plays in this range"
                copy="Recent listens are filtered by the active range too, so try widening the window or playing a few more tracks."
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
