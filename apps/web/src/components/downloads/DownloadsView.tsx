import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DownloadCloud, Trash2, Pause, Play, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import { DownloadQueueRow } from '@/components/downloads/DownloadQueueRow';
import type { DownloadQueueItem } from '@shiranami/contracts';

function cancel(id: string) {
  if (!IS_ELECTRON) return;
  // Explicit user action — surface failures instead of dropping them silently.
  window.electronAPI.downloader.cancelDownload(id).catch((err: unknown) => {
    logger.error('[downloads] cancel failed', err);
    toast.error(i18n.t('error.cancelFailed', { ns: 'downloads' }));
  });
}

function clearCompleted() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.clearCompletedDownloads().catch((err: unknown) => {
    logger.error('[downloads] clear completed failed', err);
    toast.error(i18n.t('error.clearFailed', { ns: 'downloads' }));
  });
}

function pauseQueue() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.pauseDownloadQueue().catch((err: unknown) => {
    logger.error('[downloads] pause failed', err);
    toast.error(i18n.t('error.pauseFailed', { ns: 'downloads' }));
  });
}

function resumeQueue() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.resumeDownloadQueue().catch((err: unknown) => {
    logger.error('[downloads] resume failed', err);
    toast.error(i18n.t('error.resumeFailed', { ns: 'downloads' }));
  });
}

function cancelAll() {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader.cancelAllDownloads().catch((err: unknown) => {
    logger.error('[downloads] cancel all failed', err);
    toast.error(i18n.t('error.cancelAllFailed', { ns: 'downloads' }));
  });
}

interface Section {
  key: 'active' | 'queued' | 'completed';
  items: DownloadQueueItem[];
}

export default function DownloadsView() {
  const { t } = useTranslation('downloads');
  const items = useDownloadQueueStore(s => s.items);
  const paused = useDownloadQueueStore(s => s.paused);
  const hydrated = useDownloadQueueStore(s => s.hydrated);
  const [showCancelAllConfirm, setShowCancelAllConfirm] = useState(false);

  const sections = useMemo<Section[]>(() => {
    const active: DownloadQueueItem[] = [];
    const queued: DownloadQueueItem[] = [];
    const completed: DownloadQueueItem[] = [];
    for (const item of items) {
      if (item.status === 'active' || item.status === 'converting') active.push(item);
      else if (item.status === 'queued') queued.push(item);
      else completed.push(item);
    }
    return [
      { key: 'active', items: active },
      { key: 'queued', items: queued },
      { key: 'completed', items: completed },
    ];
  }, [items]);

  const hasCompleted = sections.find(s => s.key === 'completed')!.items.length > 0;
  // There is in-flight or pending work to pause / cancel.
  const hasPendingWork =
    sections.find(s => s.key === 'active')!.items.length > 0 ||
    sections.find(s => s.key === 'queued')!.items.length > 0;

  if (items.length === 0) {
    // Hold a blank frame until the first snapshot lands so a persisted queue
    // doesn't flash "No downloads yet" on launch before it hydrates.
    if (!hydrated) {
      return <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6" />;
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
              onClick={resumeQueue}
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
              onClick={pauseQueue}
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
                  onClick={() => {
                    setShowCancelAllConfirm(false);
                    cancelAll();
                  }}
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
            onClick={clearCompleted}
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

      <div className="flex flex-col gap-6">
        {sections.map(section =>
          section.items.length === 0 ? null : (
            <section key={section.key} className="flex flex-col gap-1.5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60 px-1">
                {t(`section.${section.key}`)} · {section.items.length}
              </h2>
              {section.items.map(item => (
                <DownloadQueueRow key={item.id} item={item} onCancel={cancel} />
              ))}
            </section>
          )
        )}
      </div>
    </div>
  );
}
