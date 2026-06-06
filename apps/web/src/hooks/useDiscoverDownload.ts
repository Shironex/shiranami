import { useCallback, useMemo, useRef } from 'react';
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
  // Synchronous guard against double-enqueue on rapid clicks: the store-derived
  // status is empty until the first queue snapshot round-trips from main, so two
  // fast clicks would otherwise both pass the status check and enqueue twice.
  const inFlightRef = useRef<Set<string>>(new Set());

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
      if (inFlightRef.current.has(item.youtubeId)) return;
      inFlightRef.current.add(item.youtubeId);
      window.electronAPI.downloader
        .enqueueDownload({
          url: item.url,
          youtubeId: item.youtubeId,
          title: item.title,
          thumbnail: item.thumbnail,
        })
        .catch(() => {})
        .finally(() => inFlightRef.current.delete(item.youtubeId));
    },
    [statuses]
  );

  return { download, statuses };
}
