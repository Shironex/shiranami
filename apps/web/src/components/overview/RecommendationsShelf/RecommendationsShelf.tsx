import { useTranslation } from 'react-i18next';
import { Compass, LibraryBig, Loader2, Pause, Play, RefreshCw, Sparkles } from 'lucide-react';
import type { DiscoverRecommendation, LibraryRecommendation } from '@shiranami/contracts';
import { OverviewCover } from '../OverviewCover';
import { DownloadProgressButton } from '@/components/shared/DownloadProgressButton';
import { DownloadProgressBar } from '@/components/shared/DownloadProgressBar';
import { DependencyInstallCard } from '@/components/search/DependencyInstallCard';
import { useRecommendationsShelf } from './RecommendationsShelf.hooks';
import type { IRecommendationsShelfProps } from './RecommendationsShelf.types';

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

// ── Shared card row ──────────────────────────────────────────────────────────

interface IRecommendationCardProps {
  readonly cover: React.ReactNode;
  readonly subtitle: React.ReactNode;
  readonly trailing: React.ReactNode;
  /** When provided the whole card is a button (library rows). */
  readonly onActivate?: () => void;
  readonly ariaLabel?: string;
  /** Extra classes applied to the root element. */
  readonly className?: string;
  /** Optional overlay children (e.g. the download progress bar). */
  readonly overlay?: React.ReactNode;
}

function RecommendationCard({
  cover,
  subtitle,
  trailing,
  onActivate,
  ariaLabel,
  className = '',
  overlay,
}: IRecommendationCardProps) {
  const baseClasses =
    'group relative flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors';
  const surfaceClasses =
    'border-border/15 bg-background/20 hover:border-border/35 hover:bg-accent/35';

  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        aria-label={ariaLabel}
        className={`text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${baseClasses} ${surfaceClasses} ${className}`}
      >
        {cover}
        <div className="min-w-0 flex-1">{subtitle}</div>
        {trailing}
        {overlay}
      </button>
    );
  }

  return (
    <div className={`${baseClasses} ${surfaceClasses} ${className}`}>
      {cover}
      <div className="min-w-0 flex-1">{subtitle}</div>
      {trailing}
      {overlay}
    </div>
  );
}

// ── Section header (icon + label + optional +N more pill) ────────────────────

interface IRecommendationSectionProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly extraCount?: number;
  readonly children: React.ReactNode;
}

function RecommendationSection({ icon, label, extraCount, children }: IRecommendationSectionProps) {
  const { t } = useTranslation('recommendations');
  const showExtra = extraCount !== undefined && extraCount > 0;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {showExtra && (
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
  readonly item: LibraryRecommendation;
  readonly onPlay: (trackId: string) => void;
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
  readonly item: DiscoverRecommendation;
  readonly status: DownloadStatus;
  readonly onDownload: (item: DiscoverRecommendation) => void;
  readonly onPreview: (item: DiscoverRecommendation) => void;
  readonly isPreviewLoading: boolean;
  readonly isPreviewing: boolean;
  readonly liveRegionId: string;
}) {
  const { t } = useTranslation('recommendations');

  const isDownloading = status === 'downloading';
  const isDone = status === 'done';
  const isError = status === 'error';
  const showDiscoverTag = !isDone && !isDownloading && !isError;
  const showPreviewOverlay = isPreviewLoading || isPreviewing;

  // Sub-title line changes to reflect current download state.
  let subtitleText: React.ReactNode;
  let subtitleClass = 'truncate text-xs text-muted-foreground';
  if (isDownloading) {
    subtitleText = t('downloading');
    subtitleClass = 'truncate text-xs text-primary/70';
  } else if (isDone) {
    subtitleText = t('addedToLibrary');
    subtitleClass = 'truncate text-xs text-success/80';
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
    cardExtra = 'border-success/15 motion-safe:transition-colors motion-safe:duration-200';

  const previewAriaLabel = isPreviewing
    ? t('pausePreviewAria', { title: item.title })
    : t('previewAria', { title: item.title });

  const overlayClass = `pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 transition-opacity ${
    showPreviewOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  }`;

  let previewIcon: React.ReactNode;
  if (isPreviewLoading) {
    previewIcon = <Loader2 className="size-4 animate-spin text-white" />;
  } else if (isPreviewing) {
    previewIcon = <Pause className="size-4 fill-white text-white" />;
  } else {
    previewIcon = <Play className="size-4 fill-white text-white" />;
  }

  const cover = (
    <button
      type="button"
      onClick={() => onPreview(item)}
      aria-label={previewAriaLabel}
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
      <span className={overlayClass}>{previewIcon}</span>
    </button>
  );

  const subtitle = (
    <>
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        {showDiscoverTag && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-primary/70">
            {t('discoverTag')}
          </span>
        )}
      </div>
      <p className={subtitleClass}>{subtitleText}</p>
    </>
  );

  // Indeterminate sweep along the card bottom while downloading (no real %).
  const progressBar = isDownloading ? <DownloadProgressBar className="rounded-b-2xl" /> : null;

  const downloadAriaLabel = isDownloading
    ? t('downloadingAria', { title: item.title })
    : isDone
      ? t('addedAria', { title: item.title })
      : isError
        ? t('retryDownloadAria', { title: item.title })
        : t('downloadAria', { title: item.title });

  const liveRegionText = isDownloading
    ? t('downloadingAria', { title: item.title })
    : isDone
      ? t('addedAria', { title: item.title })
      : isError
        ? t('retryDownloadAria', { title: item.title })
        : '';

  return (
    <>
      {/* aria-live region announces state changes to screen readers */}
      <span id={liveRegionId} className="sr-only" aria-live="polite" aria-atomic="true">
        {liveRegionText}
      </span>
      <RecommendationCard
        cover={cover}
        subtitle={subtitle}
        trailing={
          <DownloadProgressButton
            status={status}
            ariaLabel={downloadAriaLabel}
            onDownload={() => onDownload(item)}
          />
        }
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
export default function RecommendationsShelf(props: IRecommendationsShelfProps) {
  const { onPlay } = props;
  const { t } = useTranslation('recommendations');
  const {
    shouldHide,
    headingId,
    isRefreshing,
    isStale,
    updatedAgo,
    needsInstall,
    showEmptyState,
    showDiscoverSection,
    librarySlice,
    libraryExtra,
    discoverSlice,
    discoverExtra,
    statuses,
    previewLoadingId,
    dependencyInstall,
    onRefresh,
    onDownload,
    onPreview,
    isPreviewing,
  } = useRecommendationsShelf(props);

  // Build the section bodies above the return so JSX stays declarative.
  const libraryRows = librarySlice.map(item => (
    <LibraryRow key={item.trackId} item={item} onPlay={onPlay} />
  ));

  const discoverRows = discoverSlice.map(item => (
    <DiscoverRow
      key={item.youtubeId}
      item={item}
      status={statuses[item.youtubeId] ?? 'idle'}
      onDownload={onDownload}
      onPreview={onPreview}
      isPreviewLoading={previewLoadingId === item.youtubeId}
      isPreviewing={isPreviewing(item.youtubeId)}
      liveRegionId={`discover-status-${item.youtubeId}`}
    />
  ));

  const refreshClass = isStale
    ? 'text-primary hover:text-primary/80'
    : 'text-primary/80 hover:text-primary';
  const refreshOpacityClass = isRefreshing ? 'opacity-70' : 'opacity-100';

  if (shouldHide) return null;

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
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={t('refreshAria')}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${refreshClass}`}
        >
          <RefreshCw className={`size-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
      </div>

      {/* ── Both-empty inner state (library exists but no picks yet) ── */}
      {/* Suppressed when tools are missing — the discover install card below
          is the actionable message in that case. */}
      {showEmptyState && (
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
            className={`grid gap-2 sm:grid-cols-2 motion-safe:transition-opacity motion-safe:duration-200 ${refreshOpacityClass}`}
          >
            {libraryRows}
          </div>
        </RecommendationSection>
      )}

      {/* ── Discover section ── */}
      {/* Render when there's something to show OR tools need installing, so the
          install card always has a home even when the backend returned nothing. */}
      {showDiscoverSection && (
        <RecommendationSection
          icon={<Compass className="size-3" />}
          label={t('discover')}
          extraCount={needsInstall ? 0 : discoverExtra}
        >
          {needsInstall ? (
            <DependencyInstallCard {...dependencyInstall} />
          ) : discoverSlice.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/20 bg-background/20 px-4 py-6 text-center">
              <Compass className="size-5 text-muted-foreground/35" aria-hidden="true" />
              <p className="max-w-sm text-sm text-muted-foreground/60">{t('discoverEmpty')}</p>
            </div>
          ) : (
            <div
              className={`grid gap-2 sm:grid-cols-2 motion-safe:transition-opacity motion-safe:duration-200 ${refreshOpacityClass}`}
            >
              {discoverRows}
            </div>
          )}
        </RecommendationSection>
      )}
    </section>
  );
}
