import { AlertCircle, DownloadCloud, Trash2, Pause, Play, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { PageHeader } from '@/components/shared/PageHeader';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { DownloadQueueRow } from '@/components/downloads/DownloadQueueRow';
import { DownloadsViewSkeleton } from './DownloadsViewSkeleton';
import { useDownloadsView } from './DownloadsView.hooks';

export default function DownloadsView() {
  const {
    t,
    sections,
    paused,
    isEmpty,
    hydrated,
    isError,
    retryLabel,
    onRetryHydration,
    hasPendingWork,
    hasCompleted,
    showCancelAllConfirm,
    setShowCancelAllConfirm,
    onCancelItem,
    onClearCompleted,
    onPauseQueue,
    onResumeQueue,
    onConfirmCancelAll,
  } = useDownloadsView();

  if (isError) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader title={t('title')} />
        <ViewEmptyState
          variant="error"
          title={t('loadError.title')}
          subtitle={t('loadError.subtitle')}
          icon={AlertCircle}
          action={{ label: retryLabel, onClick: onRetryHydration }}
        />
      </div>
    );
  }

  // Hold a skeleton frame until the first snapshot lands so a persisted queue
  // doesn't flash "No downloads yet" on launch before it hydrates.
  if (!hydrated) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader title={t('title')} />
        <span role="status" className="sr-only">
          {t('loading')}
        </span>
        <DownloadsViewSkeleton />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader title={t('title')} />
        <ViewEmptyState
          title={t('empty.title')}
          subtitle={t('empty.description')}
          icon={DownloadCloud}
        />
      </div>
    );
  }

  const sectionBlocks = sections.map(section => {
    if (section.items.length === 0) return null;
    const rows = section.items.map(item => (
      <DownloadQueueRow key={item.id} item={item} onCancel={onCancelItem} />
    ));
    const heading = `${t(`section.${section.key}`)} · ${section.items.length}`;
    return (
      <section key={section.key} className="flex flex-col gap-1.5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60 px-1">
          {heading}
        </h2>
        {rows}
      </section>
    );
  });

  const headerActions = (
    <>
      {paused ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onResumeQueue}
          aria-label={t('a11y.resumeQueue')}
        >
          <Play className="size-4" />
          {t('action.resume')}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onPauseQueue}
          disabled={!hasPendingWork}
          aria-label={t('a11y.pauseQueue')}
        >
          <Pause className="size-4" />
          {t('action.pause')}
        </Button>
      )}

      <Popover open={showCancelAllConfirm} onOpenChange={setShowCancelAllConfirm}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPendingWork}
            aria-label={t('a11y.cancelAll')}
            className="text-destructive hover:text-destructive"
          >
            <Ban className="size-4" />
            {t('action.cancelAll')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <p className="text-xs text-foreground/80 mb-2">{t('action.cancelAllConfirm')}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onConfirmCancelAll}
              className="focus-ring flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
            >
              {t('action.cancelAllConfirmAction')}
            </button>
            <button
              onClick={() => setShowCancelAllConfirm(false)}
              className="focus-ring flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {t('action.keep')}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="sm" onClick={onClearCompleted} disabled={!hasCompleted}>
        <Trash2 className="size-4" />
        {t('action.clearCompleted')}
      </Button>
    </>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('title')} actions={headerActions} />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pt-4 pb-6">
        {paused && (
          <div
            role="status"
            className="mb-4 px-3 py-2 rounded-xl bg-warning/10 border border-warning/25 text-xs text-warning"
          >
            {t('paused.banner')}
          </div>
        )}

        <div className="flex flex-col gap-6">{sectionBlocks}</div>
      </div>
    </div>
  );
}
