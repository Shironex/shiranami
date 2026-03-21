import { useCallback, useEffect, useState } from 'react';
import { formatDuration } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';
import { subscribeToListeningHistoryUpdates } from '@/lib/listeningHistory';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type {
  ListeningHistoryEntry,
  ListeningStatsArtist,
  ListeningStatsSummary,
  ListeningStatsTrack,
} from '@/types/electron';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, CheckCircle2, Clock3, Disc3, Music, PlayCircle } from 'lucide-react';

const EMPTY_SUMMARY: ListeningStatsSummary = {
  totalPlays: 0,
  totalMinutes: 0,
  uniqueTracks: 0,
  uniqueArtists: 0,
  completedPlays: 0,
  topTracks: [],
  topArtists: [],
};

function formatTotalTime(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h`;
  }

  return `${Math.round(minutes)}m`;
}

function formatListenTime(seconds: number): string {
  if (seconds >= 3600) {
    return `${(seconds / 3600).toFixed(1)}h listened`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)}m listened`;
  }
  return `${Math.max(1, Math.round(seconds))}s listened`;
}

function formatPlayedAt(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof BarChart3;
}) {
  return (
    <div className="rounded-2xl border border-border/25 bg-background/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/55">
          {label}
        </span>
        <Icon className="size-4 text-primary/80" />
      </div>
      <p className="mt-3 font-display text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground/65">{hint}</p>
    </div>
  );
}

function TrackArtwork({
  albumArt,
  title,
}: {
  albumArt: string | null;
  title: string;
}) {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/35">
      {albumArt ? (
        <img src={albumArt} alt={title} className="h-full w-full object-cover" />
      ) : (
        <Music className="size-4 text-muted-foreground/45" />
      )}
    </div>
  );
}

function TopTrackRow({
  track,
  onPlay,
}: {
  track: ListeningStatsTrack;
  onPlay: (trackId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay(track.trackId)}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3 text-left transition-colors hover:border-border/35 hover:bg-accent/35"
    >
      <TrackArtwork albumArt={track.albumArt} title={track.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{track.playCount} plays</p>
        <p className="text-[11px] text-muted-foreground/65">{formatListenTime(track.listenedSeconds)}</p>
      </div>
    </button>
  );
}

function TopArtistRow({ artist }: { artist: ListeningStatsArtist }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{artist.artist || 'Unknown Artist'}</p>
        <p className="text-[11px] text-muted-foreground/65">{formatListenTime(artist.listenedSeconds)}</p>
      </div>
      <span className="shrink-0 text-xs font-medium text-foreground">{artist.playCount} plays</span>
    </div>
  );
}

function RecentRow({
  entry,
  onPlay,
}: {
  entry: ListeningHistoryEntry;
  onPlay: (trackId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlay(entry.trackId)}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3 text-left transition-colors hover:border-border/35 hover:bg-accent/35"
    >
      <TrackArtwork albumArt={entry.albumArt} title={entry.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.artist} / {entry.album}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{formatDuration(entry.playedSeconds)}</p>
        <p className="text-[11px] text-muted-foreground/65">{formatPlayedAt(entry.playedAt)}</p>
      </div>
    </button>
  );
}

function HistoryViewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10 pt-6">
      <div className="rounded-[28px] border border-border/25 bg-surface/35 p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-10 w-72 max-w-full" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border/25 bg-background/35 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <Skeleton className="h-5 w-36" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-3 rounded-2xl border border-border/20 p-3">
                  <Skeleton className="size-11 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-2xl border border-border/20 p-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HistoryView() {
  const library = usePlayerStore((s) => s.library);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const [summary, setSummary] = useState<ListeningStatsSummary>(EMPTY_SUMMARY);
  const [recent, setRecent] = useState<ListeningHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistoryData = useCallback(async () => {
    if (!IS_ELECTRON) {
      setSummary(EMPTY_SUMMARY);
      setRecent([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const [nextSummary, nextRecent] = await Promise.all([
        window.electronAPI.db.history.getSummary(),
        window.electronAPI.db.history.getRecent(25),
      ]);

      setSummary(nextSummary);
      setRecent(nextRecent);
    } catch {
      setSummary(EMPTY_SUMMARY);
      setRecent([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistoryData();
    return subscribeToListeningHistoryUpdates(() => {
      void loadHistoryData();
    });
  }, [loadHistoryData]);

  const handlePlayTrack = useCallback((trackId: string) => {
    const index = library.findIndex((track) => track.id === trackId);
    if (index >= 0) {
      setQueue(library, index);
    }
  }, [library, setQueue]);

  const isEmpty = !isLoading && summary.totalPlays === 0 && recent.length === 0;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <HistoryViewSkeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex-1 px-6 py-10">
        <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-[28px] border border-border/25 bg-surface/35 px-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <BarChart3 className="size-7 text-primary/80" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-foreground">No listening history yet</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground/70">
              Play a few tracks through to meaningful listens and Shiranami will start building your recent history and listening stats here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10 pt-6">
        <section className="relative overflow-hidden rounded-[28px] border border-border/25 bg-surface/35 p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.18),transparent_45%)]" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground/55">Listening History</p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
              A running picture of what you actually finish listening to.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground/75">
              Stats are built from meaningful listens, not every accidental click. Recent plays update automatically as tracks finish.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Logged Plays"
            value={summary.totalPlays.toLocaleString()}
            hint="Meaningful listens recorded"
            icon={PlayCircle}
          />
          <StatCard
            label="Listening Time"
            value={formatTotalTime(summary.totalMinutes)}
            hint="Cumulative logged playback"
            icon={Clock3}
          />
          <StatCard
            label="Unique Tracks"
            value={summary.uniqueTracks.toLocaleString()}
            hint="Songs that made your history"
            icon={Music}
          />
          <StatCard
            label="Completed Plays"
            value={summary.completedPlays.toLocaleString()}
            hint="Sessions finished at 95%+"
            icon={CheckCircle2}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <div className="flex items-center gap-2">
              <Disc3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">Top Tracks</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.topTracks.map((track) => (
                <TopTrackRow key={track.trackId} track={track} onPlay={handlePlayTrack} />
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary/80" />
              <h2 className="font-display text-lg font-semibold text-foreground">Top Artists</h2>
            </div>
            <div className="mt-4 space-y-3">
              {summary.topArtists.map((artist) => (
                <TopArtistRow key={artist.artist} artist={artist} />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary/80" />
            <h2 className="font-display text-lg font-semibold text-foreground">Recent Plays</h2>
          </div>
          <div className="mt-4 space-y-3">
            {recent.map((entry) => (
              <RecentRow key={entry.id} entry={entry} onPlay={handlePlayTrack} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
