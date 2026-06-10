import { useTranslation } from 'react-i18next';
import { Disc3, Play } from 'lucide-react';
import { pad2 } from '@shiranami/shared';
import type { ListeningStatsTrack } from '@/types/electron';
import { OverviewCover } from '@/components/overview/OverviewCover';

interface TopThisWeekProps {
  tracks: ListeningStatsTrack[];
  onPlay: (trackId: string) => void;
  onOpenLibrary: () => void;
}

function TopRow({
  track,
  rank,
  maxPlays,
  onPlay,
}: {
  track: ListeningStatsTrack;
  rank: number;
  maxPlays: number;
  onPlay: (trackId: string) => void;
}) {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');
  const width = maxPlays > 0 ? Math.max(8, Math.round((track.playCount / maxPlays) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={() => onPlay(track.trackId)}
      aria-label={t('playAria', { title: track.title })}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border/15 bg-background/20 px-3 py-2.5 text-left transition-colors hover:border-border/35 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground/55">
        {pad2(rank)}
      </span>

      <div className="relative size-10 shrink-0">
        <OverviewCover
          albumArt={track.albumArt}
          title={track.title}
          seed={track.album || track.artist}
          className="size-10"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-4 fill-white text-white" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artist || tCommon('unknownArtist')}
          {track.album ? ` · ${track.album}` : ''}
        </p>
      </div>

      <div className="flex w-24 shrink-0 items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/8">
          <span
            className="block h-full rounded-full bg-primary/70"
            style={{ width: `${width}%` }}
          />
        </span>
        <span className="w-6 text-right font-mono text-xs tabular-nums text-foreground/80">
          {track.playCount}
        </span>
      </div>
    </button>
  );
}

export function TopThisWeek({ tracks, onPlay, onOpenLibrary }: TopThisWeekProps) {
  const { t } = useTranslation('overview');
  const maxPlays = tracks.reduce((max, track) => Math.max(max, track.playCount), 0);

  return (
    <section className="flex flex-col rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Disc3 className="size-4 text-primary/80" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            {t('topThisWeek', { em: t('topThisWeekEm') })}
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('openLibrary')} →
        </button>
      </div>

      {tracks.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border/20 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground/60">
          {t('topEmptyCopy')}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {tracks.map((track, index) => (
            <TopRow
              key={track.trackId}
              track={track}
              rank={index + 1}
              maxPlays={maxPlays}
              onPlay={onPlay}
            />
          ))}
        </div>
      )}
    </section>
  );
}
