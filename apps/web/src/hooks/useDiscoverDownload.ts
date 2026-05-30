import { useCallback, useMemo } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import type { DiscoverRecommendation, DownloadQueueStatus } from '@shiranami/contracts';

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

/** Map the main-queue lifecycle status onto the discover shelf's UI status. */
function mapQueueStatus(status: DownloadQueueStatus): DownloadStatus {
  switch (status) {
    case 'queued':
    case 'active':
    case 'converting':
      return 'downloading';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'canceled':
      return 'idle';
  }
}

/**
 * Enqueues a discovered (not-yet-owned) track into the download queue. Per-item
 * status is read live from the queue store keyed by `youtubeId`; library import
 * + the success/dup toast happen in the central queue importer (App level).
 */
export function useDiscoverDownload() {
  const byYoutubeId = useDownloadQueueStore(s => s.byYoutubeId);

  const statuses = useMemo<Record<string, DownloadStatus>>(() => {
    const out: Record<string, DownloadStatus> = {};
    for (const [youtubeId, item] of byYoutubeId) {
      out[youtubeId] = mapQueueStatus(item.status);
    }
    return out;
  }, [byYoutubeId]);

  const download = useCallback(
    (item: DiscoverRecommendation) => {
      if (!IS_ELECTRON || statuses[item.youtubeId] === 'downloading') return;
      window.electronAPI.downloader
        .enqueueDownload({ url: item.url, youtubeId: item.youtubeId, title: item.title })
        .catch(() => {});
    },
    [statuses]
  );

  return { download, statuses };
}
