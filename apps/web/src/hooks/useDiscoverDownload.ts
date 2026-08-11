import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { IS_ELECTRON } from '@/lib/platform';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';
import type { DiscoverRecommendation, DownloadQueueStatus } from '@shiranami/contracts';

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

/**
 * What one [`useDiscoverDownload`] `download` call actually did.
 *
 * The call has three outcomes and used to report none of them — it returned
 * `void`, swallowed its own rejection in a `.catch`, and early-returned on the
 * guards. A caller that wanted to show the user whether the track reached the
 * queue had nothing to go on and could only assume it had.
 *
 * `pending` is deliberately not a failure: the guards fire when *this*
 * `youtubeId` is already on its way to the queue, so a caller showing "queued"
 * for it is telling the truth. Only `failed` means nothing is coming, and only
 * `failed` should leave the action retryable.
 */
export type DownloadOutcome = 'enqueued' | 'pending' | 'failed';

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

  /**
   * Hand one item to the download queue, and say what happened.
   *
   * Everything up to the `await` still runs in the click's own tick, which is
   * what the in-flight guard depends on: two fast clicks must not both get past
   * `has` before either has run `add`.
   */
  const download = useCallback(
    async (item: DiscoverRecommendation): Promise<DownloadOutcome> => {
      if (!IS_ELECTRON) return 'failed';
      if (statuses[item.youtubeId] === 'downloading') return 'pending';
      if (inFlightRef.current.has(item.youtubeId)) return 'pending';
      inFlightRef.current.add(item.youtubeId);
      try {
        await window.electronAPI.downloader.enqueueDownload({
          url: item.url,
          youtubeId: item.youtubeId,
          title: item.title,
          thumbnail: item.thumbnail,
        });
        return 'enqueued';
      } catch (err: unknown) {
        logger.error('[discover] failed to enqueue download', err);
        toast.error(i18n.t('failedQueueDownload', { ns: 'toast' }));
        return 'failed';
      } finally {
        inFlightRef.current.delete(item.youtubeId);
      }
    },
    [statuses]
  );

  return { download, statuses };
}
