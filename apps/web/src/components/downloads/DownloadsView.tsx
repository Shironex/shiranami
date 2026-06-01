import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DownloadCloud, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface Section {
  key: 'active' | 'queued' | 'completed';
  items: DownloadQueueItem[];
}

export default function DownloadsView() {
  const { t } = useTranslation('downloads');
  const items = useDownloadQueueStore(s => s.items);

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

  if (items.length === 0) {
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
        <Button
          variant="outline"
          size="sm"
          onClick={clearCompleted}
          disabled={!hasCompleted}
          className="rounded-xl shrink-0"
        >
          <Trash2 className="size-4" />
          {t('action.clearCompleted')}
        </Button>
      </header>

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
