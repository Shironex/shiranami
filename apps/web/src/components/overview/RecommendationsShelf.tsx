import { useTranslation } from 'react-i18next';
import { Compass, Download, Loader2, Play, RefreshCw, Sparkles } from 'lucide-react';
import type { DiscoverRecommendation, LibraryRecommendation } from '@shiranami/contracts';
import { OverviewCover } from '@/components/overview/OverviewCover';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useDiscoverDownload } from '@/hooks/useDiscoverDownload';

interface RecommendationsShelfProps {
  /** Plays an existing library track by id (Overview's handler). */
  onPlay: (trackId: string) => void;
}

/**
 * Minimal, functional recommendations shelf for the Overview. Surfaces two
 * sections — "Recommended from your library" (affinity-ranked owned tracks)
 * and "Discover new music" (yt-dlp RD-mix, downloadable). Deliberately
 * unpolished: visual/UX design is a follow-up /kirei ui pass. Renders nothing
 * when both shelves are empty so it never shows a dead panel.
 */
export function RecommendationsShelf({ onPlay }: RecommendationsShelfProps) {
  const { t } = useTranslation('recommendations');
  const { library, discover, isLoading, isRefreshing, refresh, hasAny } = useRecommendations();
  const { download, statuses } = useDiscoverDownload();

  if (isLoading || !hasAny) return null;

  return (
    <section className="flex flex-col gap-4 rounded-[24px] border border-border/25 glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary/80" />
          <h2 className="font-display text-lg font-semibold text-foreground">{t('title')}</h2>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
      </div>

      {library.items.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {t('fromLibrary')}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {library.items.slice(0, 8).map(item => (
              <LibraryRow key={item.trackId} item={item} onPlay={onPlay} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          <Compass className="size-3" />
          {t('discover')}
        </h3>
        {discover.items.length === 0 ? (
          <p className="rounded-2xl border border-border/20 bg-background/20 px-4 py-6 text-center text-sm text-muted-foreground/60">
            {t('discoverEmpty')}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {discover.items.slice(0, 8).map(item => (
              <DiscoverRow
                key={item.youtubeId}
                item={item}
                status={statuses[item.youtubeId] ?? 'idle'}
                onDownload={download}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LibraryRow({
  item,
  onPlay,
}: {
  item: LibraryRecommendation;
  onPlay: (trackId: string) => void;
}) {
  const { t } = useTranslation('recommendations');
  return (
    <button
      type="button"
      onClick={() => onPlay(item.trackId)}
      aria-label={t('playAria', { title: item.title })}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border/15 bg-background/20 px-3 py-2.5 text-left transition-colors hover:border-border/35 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative size-10 shrink-0">
        <OverviewCover
          albumArt={item.albumArt}
          title={item.title}
          seed={item.album || item.artist}
          className="size-10"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-4 fill-white text-white" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.artist}</p>
      </div>
    </button>
  );
}

function DiscoverRow({
  item,
  status,
  onDownload,
}: {
  item: DiscoverRecommendation;
  status: 'idle' | 'downloading' | 'done' | 'error';
  onDownload: (item: DiscoverRecommendation) => void;
}) {
  const { t } = useTranslation('recommendations');
  const busy = status === 'downloading';
  const done = status === 'done';
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-border/15 bg-background/20 px-3 py-2.5">
      <div className="size-10 shrink-0 overflow-hidden rounded-xl bg-foreground/8">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <OverviewCover
            albumArt={null}
            title={item.title}
            seed={item.uploader}
            className="size-10"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.uploader}</p>
      </div>
      <button
        type="button"
        onClick={() => onDownload(item)}
        disabled={busy || done}
        aria-label={t('downloadAria', { title: item.title })}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/20 text-primary/80 transition-colors hover:border-border/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      </button>
    </div>
  );
}
