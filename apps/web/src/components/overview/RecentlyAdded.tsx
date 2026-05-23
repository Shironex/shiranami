import { useTranslation } from 'react-i18next';
import { Play, Sparkles } from 'lucide-react';
import type { Track } from '@/stores/types';
import { OverviewCover } from '@/components/overview/OverviewCover';
import { formatRelativeTime } from '@/components/overview/overviewUtils';

interface RecentlyAddedProps {
  tracks: Track[];
  onPlay: (trackId: string) => void;
}

export function RecentlyAdded({ tracks, onPlay }: RecentlyAddedProps) {
  const { t, i18n } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');

  return (
    <section className="rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary/80" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            {t('recentlyAdded', { em: t('recentlyAddedEm') })}
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
          {t('recentCount', { count: tracks.length })}
        </span>
      </div>

      {/* Native horizontal scroll keeps it keyboard-accessible: each card is a
          focusable <button>, so arrow/Tab focus scrolls the rail into view. */}
      <ul className="mt-4 flex gap-3 overflow-x-auto scrollbar-thin pb-1">
        {tracks.map(track => {
          const relative = formatRelativeTime(track.createdAt, i18n.language);
          return (
            <li key={track.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onPlay(track.id)}
                aria-label={t('playAria', { title: track.title })}
                className="group flex w-36 flex-col gap-2 rounded-2xl border border-transparent p-2 text-left transition-colors hover:border-border/30 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-square w-full">
                  <OverviewCover
                    albumArt={track.albumArt}
                    title={track.title}
                    seed={track.album || track.artist}
                    className="size-full rounded-xl"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="size-6 fill-white text-white" />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
                  <p className="truncate text-xs text-muted-foreground/70">
                    {track.artist || tCommon('unknownArtist')}
                    {relative ? ` · ${relative}` : ''}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
