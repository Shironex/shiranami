import { DownloadCloud, Trash2, Pause, Play, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { DownloadQueueRow } from '@/components/downloads/DownloadQueueRow';
import { useDownloadsView } from './DownloadsView.hooks';

export default function DownloadsView() {
  const {
    t,
    sections,
    paused,
    isEmpty,
    hydrated,
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

  if (isEmpty) {
    // Hold a blank frame until the first snapshot lands so a persisted queue
    // doesn't flash "No downloads yet" on launch before it hydrates.
    if (!hydrated) {
      return (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6" aria-busy="true">
          <span role="status" className="sr-only">
            {t('loading')}
          </span>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6">
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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground/70 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {paused ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onResumeQueue}
              aria-label={t('a11y.resumeQueue')}
              className="rounded-xl"
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
              className="rounded-xl"
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
                className="rounded-xl text-destructive hover:text-destructive"
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
                  className="flex-1 px-2 py-1 rounded-lg text-xs font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('action.cancelAllConfirmAction')}
                </button>
                <button
                  onClick={() => setShowCancelAllConfirm(false)}
                  className="flex-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('action.keep')}
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            onClick={onClearCompleted}
            disabled={!hasCompleted}
            className="rounded-xl"
          >
            <Trash2 className="size-4" />
            {t('action.clearCompleted')}
          </Button>
        </div>
      </header>

      {paused && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500/90">
          {t('paused.banner')}
        </div>
      )}

      <div className="flex flex-col gap-6">{sectionBlocks}</div>
    </div>
  );
}
