import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Check,
  Compass,
  Download,
  LibraryBig,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { DiscoverRecommendation, LibraryRecommendation } from '@shiranami/contracts';
import { OverviewCover } from '@/components/overview/OverviewCover';
import { formatRelativeTime } from '@/components/overview/overviewUtils';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useDiscoverDownload } from '@/hooks/useDiscoverDownload';
import { useAudioPreview, type PreviewableItem } from '@/hooks/useAudioPreview';
import { useSearchDependencies } from '@/hooks/useSearchDependencies';
import { DependencyInstallCard } from '@/components/search/DependencyInstallCard';

/**
 * Maps a discover recommendation onto the shared preview shape. Discover items
 * come from a `--flat-playlist` dump, so there's no duration — the player
 * resolves the real length from the stream once it loads.
 */
function toPreviewable(item: DiscoverRecommendation): PreviewableItem {
  return {
    id: item.youtubeId,
    title: item.title,
    uploader: item.uploader,
    duration: 0,
    thumbnail: item.thumbnail,
    url: item.url,
    webpage_url: item.url,
  };
}

interface RecommendationsShelfProps {
  /** Plays an existing library track by id (Overview's handler). */
  onPlay: (trackId: string) => void;
  /**
   * Whether the user already has a library. Controls the both-empty behaviour:
   * when true and both shelves are empty, show the shell + quiet inner empty
   * state (not null). When false (first run), return null so the Overview's
   * first-run state owns the surface.
   */
  hasLibrary: boolean;
}

// ── Shared card row ──────────────────────────────────────────────────────────

interface RecommendationCardProps {
  cover: React.ReactNode;
  subtitle: React.ReactNode;
  trailing: React.ReactNode;
  variant: 'library' | 'discover';
  /** When provided the whole card is a button (library rows). */
  onActivate?: () => void;
  ariaLabel?: string;
  /** Extra classes applied to the root element. */
  className?: string;
  /** Optional overlay children (e.g. the download progress bar). */
  overlay?: React.ReactNode;
}

function RecommendationCard({
  cover,
  subtitle,
  trailing,
  variant: _variant,
  onActivate,
  ariaLabel,
  className = '',
  overlay,
}: RecommendationCardProps) {
  const baseClasses =
    'group relative flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors';
  const variantClasses =
    'border-border/15 bg-background/20 hover:border-border/35 hover:bg-accent/35';

  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        aria-label={ariaLabel}
        className={`text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${baseClasses} ${variantClasses} ${className}`}
      >
        {cover}
        <div className="min-w-0 flex-1">{subtitle}</div>
        {trailing}
        {overlay}
      </button>
    );
  }

  return (
    <div className={`${baseClasses} ${variantClasses} ${className}`}>
      {cover}
      <div className="min-w-0 flex-1">{subtitle}</div>
      {trailing}
      {overlay}
    </div>
  );
}

// ── Download button state machine ────────────────────────────────────────────

interface DiscoverDownloadButtonProps {
  title: string;
  status: 'idle' | 'downloading' | 'done' | 'error';
  onDownload: () => void;
}

function DiscoverDownloadButton({ title, status, onDownload }: DiscoverDownloadButtonProps) {
  const { t } = useTranslation('recommendations');

  const ariaLabel =
    status === 'downloading'
      ? t('downloadingAria', { title })
      : status === 'done'
        ? t('addedAria', { title })
        : status === 'error'
          ? t('retryDownloadAria', { title })
          : t('downloadAria', { title });

  const isDisabled = status === 'downloading' || status === 'done';

  let icon: React.ReactNode;
  let colorClass: string;
  let borderClass: string;

  if (status === 'downloading') {
    icon = <Loader2 className="size-4 animate-spin" />;
    colorClass = 'text-primary/80';
    borderClass = 'border-primary/20';
  } else if (status === 'done') {
    icon = <Check className="size-4" />;
    colorClass = 'text-emerald-400/90';
    borderClass = 'border-emerald-400/15 motion-safe:transition-colors motion-safe:duration-200';
  } else if (status === 'error') {
    icon = <AlertCircle className="size-4" />;
    colorClass = 'text-destructive';
    borderClass = 'border-destructive/20';
  } else {
    icon = <Download className="size-4" />;
    colorClass = 'text-primary/80';
    borderClass = 'border-border/20';
  }

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onDownload}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={status === 'downloading' ? 'true' : undefined}
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${borderClass} ${colorClass} transition-colors hover:border-border/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100`}
    >
      {icon}
    </button>
  );
}

// ── Section header (icon + label + optional +N more pill) ────────────────────

interface RecommendationSectionProps {
  icon: React.ReactNode;
  label: string;
  extraCount?: number;
  children: React.ReactNode;
}

function RecommendationSection({ icon, label, extraCount, children }: RecommendationSectionProps) {
  const { t } = useTranslation('recommendations');
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {extraCount !== undefined && extraCount > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/45">
            {t('moreCount', { count: extraCount })}
          </span>
        )}
      </h3>
      {children}
    </div>
  );
}

// ── Library row ──────────────────────────────────────────────────────────────

function LibraryRow({
  item,
  onPlay,
}: {
  item: LibraryRecommendation;
  onPlay: (trackId: string) => void;
}) {
  const { t } = useTranslation('recommendations');

  const cover = (
    <div className="relative size-10 shrink-0">
      <OverviewCover
        albumArt={item.albumArt}
        title={item.title}
        seed={item.album || item.artist}
        className="size-10 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-[1.03]"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
        <Play className="size-4 fill-white text-white" />
      </span>
    </div>
  );

  const subtitle = (
    <>
      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
      <p className="truncate text-xs text-muted-foreground">{item.artist}</p>
    </>
  );

  return (
    <RecommendationCard
      cover={cover}
      subtitle={subtitle}
      trailing={null}
      variant="library"
      onActivate={() => onPlay(item.trackId)}
      ariaLabel={t('playAria', { title: item.title })}
    />
  );
}

// ── Discover row ─────────────────────────────────────────────────────────────

function DiscoverRow({
  item,
  status,
  onDownload,
  onPreview,
  isPreviewLoading,
  isPreviewing,
  liveRegionId,
}: {
  item: DiscoverRecommendation;
  status: 'idle' | 'downloading' | 'done' | 'error';
  onDownload: (item: DiscoverRecommendation) => void;
  onPreview: (item: DiscoverRecommendation) => void;
  isPreviewLoading: boolean;
  isPreviewing: boolean;
  liveRegionId: string;
}) {
  const { t } = useTranslation('recommendations');

  const isDownloading = status === 'downloading';
  const isDone = status === 'done';
  const isError = status === 'error';

  // Sub-title line changes to reflect current download state.
  let subtitleText: React.ReactNode;
  let subtitleClass = 'truncate text-xs text-muted-foreground';
  if (isDownloading) {
    subtitleText = t('downloading');
    subtitleClass = 'truncate text-xs text-primary/70';
  } else if (isDone) {
    subtitleText = t('addedToLibrary');
    subtitleClass = 'truncate text-xs text-emerald-400/80';
  } else if (isError) {
    subtitleText = t('downloadError');
    subtitleClass = 'truncate text-xs text-destructive/80';
  } else {
    subtitleText = item.uploader;
  }

  // Card border and bg evolve with state.
  let cardExtra = '';
  if (isDownloading) cardExtra = 'bg-primary/[0.04]';
  if (isDone)
    cardExtra = 'border-emerald-400/15 motion-safe:transition-colors motion-safe:duration-200';

  const cover = (
    <button
      type="button"
      onClick={() => onPreview(item)}
      aria-label={
        isPreviewing
          ? t('pausePreviewAria', { title: item.title })
          : t('previewAria', { title: item.title })
      }
      className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-foreground/8 ring-1 ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="size-full object-cover motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-[1.03]"
          loading="lazy"
        />
      ) : (
        <OverviewCover
          albumArt={null}
          title={item.title}
          seed={item.uploader}
          className="size-10 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-[1.03]"
        />
      )}
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 transition-opacity ${
          isPreviewLoading || isPreviewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isPreviewLoading ? (
          <Loader2 className="size-4 animate-spin text-white" />
        ) : isPreviewing ? (
          <Pause className="size-4 fill-white text-white" />
        ) : (
          <Play className="size-4 fill-white text-white" />
        )}
      </span>
    </button>
  );

  const subtitle = (
    <>
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {!isDone && !isDownloading && !isError && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-primary/70">
            {t('discoverTag')}
          </span>
        )}
      </div>
      <p className={subtitleClass}>{subtitleText}</p>
    </>
  );

  // Indeterminate progress bar along the card bottom while downloading.
  // The sweep animation class is gated in globals.css reduced-motion block.
  const progressBar = isDownloading ? (
    <span
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl"
      aria-hidden="true"
    >
      <span className="progress-sweep block h-full w-1/3 rounded-full bg-primary/60" />
    </span>
  ) : null;

  return (
    <>
      {/* aria-live region announces state changes to screen readers */}
      <span id={liveRegionId} className="sr-only" aria-live="polite" aria-atomic="true">
        {isDownloading
          ? t('downloadingAria', { title: item.title })
          : isDone
            ? t('addedAria', { title: item.title })
            : isError
              ? t('retryDownloadAria', { title: item.title })
              : ''}
      </span>
      <RecommendationCard
        cover={cover}
        subtitle={subtitle}
        trailing={
          <DiscoverDownloadButton
            title={item.title}
            status={status}
            onDownload={() => onDownload(item)}
          />
        }
        variant="discover"
        className={cardExtra}
        overlay={progressBar}
      />
    </>
  );
}

// ── Main shelf ───────────────────────────────────────────────────────────────

/**
 * Recommendations shelf: "From your library" + "Discover new music" sections.
 * Hardened against all data states — both-empty, stale, loading (skeleton owns
 * loading via OverviewViewSkeleton), download in-progress/done/error.
 */
export function RecommendationsShelf({ onPlay, hasLibrary }: RecommendationsShelfProps) {
  const { t, i18n } = useTranslation('recommendations');
  const { library, discover, isLoading, isRefreshing, refresh, hasAny } = useRecommendations();
  const { download, statuses } = useDiscoverDownload();
  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview();
  const {
    dependencyState,
    dependenciesSnapshot,
    dependencyInstallStatus,
    dependencyInstallError,
    isDependencyInstallInProgress,
    dependencyInstallProgress,
    dependencyInstallLabel,
    handleInstallDependencies,
  } = useSearchDependencies();
  const headingId = useId();

  // True first run (no library at all): stay hidden so Overview's welcome
  // empty state owns the surface. Also stay hidden while still loading.
  if (isLoading || !hasLibrary) return null;

  // Discover needs yt-dlp (preview stream + download) and ffmpeg (transcode).
  // When they're missing the backend can't fetch a mix, so we show the same
  // install card search/import use instead of a generic empty state. The
  // library section needs no tools (local files), so gating is discover-only.
  const needsInstall = dependencyState === 'needs-install';

  const isStale = library.stale || discover.stale;
  const generatedAt = library.generatedAt ?? discover.generatedAt;
  const updatedAgo = isStale && generatedAt ? formatRelativeTime(generatedAt, i18n.language) : null;

  const librarySlice = library.items.slice(0, 8);
  const libraryExtra = Math.max(0, library.items.length - 8);
  const discoverSlice = discover.items.slice(0, 8);
  const discoverExtra = Math.max(0, discover.items.length - 8);

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={isRefreshing ? 'true' : undefined}
      className="flex flex-col gap-4 rounded-[24px] border border-border/25 glass-panel p-4"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary/80" />
          <h2 id={headingId} className="font-display text-lg font-semibold text-foreground">
            {t('title')}
          </h2>
          {updatedAgo && (
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground/55 sm:flex">
              <span className="size-1.5 shrink-0 rounded-full bg-primary/40" aria-hidden="true" />
              {t('updatedAgo', { time: updatedAgo })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isRefreshing}
          aria-label={t('refreshAria')}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
            isStale ? 'text-primary hover:text-primary/80' : 'text-primary/80 hover:text-primary'
          }`}
        >
          <RefreshCw className={`size-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
      </div>

      {/* ── Both-empty inner state (library exists but no picks yet) ── */}
      {/* Suppressed when tools are missing — the discover install card below
          is the actionable message in that case. */}
      {!hasAny && !needsInstall && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/20 bg-background/20 px-4 py-8 text-center">
          <Sparkles className="size-6 text-muted-foreground/40" aria-hidden="true" />
          <div className="max-w-sm">
            <p className="text-sm font-medium text-foreground/80">{t('shelfEmptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground/60">{t('shelfEmptySubtitle')}</p>
          </div>
        </div>
      )}

      {/* ── Library section ── */}
      {librarySlice.length > 0 && (
        <RecommendationSection
          icon={<LibraryBig className="size-3" />}
          label={t('fromLibrary')}
          extraCount={libraryExtra}
        >
          <div
            className={`grid gap-2 sm:grid-cols-2 motion-safe:transition-opacity motion-safe:duration-200 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}
          >
            {librarySlice.map(item => (
              <LibraryRow key={item.trackId} item={item} onPlay={onPlay} />
            ))}
          </div>
        </RecommendationSection>
      )}

      {/* ── Discover section ── */}
      {/* Render when there's something to show OR tools need installing, so the
          install card always has a home even when the backend returned nothing. */}
      {(hasAny || needsInstall) && (
        <RecommendationSection
          icon={<Compass className="size-3" />}
          label={t('discover')}
          extraCount={needsInstall ? 0 : discoverExtra}
        >
          {needsInstall ? (
            <DependencyInstallCard
              ffmpegInstalled={dependenciesSnapshot?.ffmpegInstalled}
              installStatus={dependencyInstallStatus}
              installError={dependencyInstallError}
              isInstallInProgress={isDependencyInstallInProgress}
              installProgress={dependencyInstallProgress}
              installLabel={dependencyInstallLabel}
              onInstall={handleInstallDependencies}
            />
          ) : discoverSlice.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/20 bg-background/20 px-4 py-6 text-center">
              <Compass className="size-5 text-muted-foreground/35" aria-hidden="true" />
              <p className="max-w-sm text-sm text-muted-foreground/60">{t('discoverEmpty')}</p>
            </div>
          ) : (
            <div
              className={`grid gap-2 sm:grid-cols-2 motion-safe:transition-opacity motion-safe:duration-200 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}
            >
              {discoverSlice.map(item => (
                <DiscoverRow
                  key={item.youtubeId}
                  item={item}
                  status={statuses[item.youtubeId] ?? 'idle'}
                  onDownload={download}
                  onPreview={it => handlePreview(toPreviewable(it))}
                  isPreviewLoading={previewLoadingId === item.youtubeId}
                  isPreviewing={isPreviewPlaying({ id: item.youtubeId })}
                  liveRegionId={`discover-status-${item.youtubeId}`}
                />
              ))}
            </div>
          )}
        </RecommendationSection>
      )}
    </section>
  );
}
