import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import { useDownloadBatchStore, type BatchDoneEntry } from '@/stores/useDownloadBatchStore';
import { queryClient } from '@/lib/queryClient';
import { playlistKeys } from '@/hooks/queries/usePlaylists';
import { logger } from '@/lib/logger';
import type { DownloadQueueItem } from '@shiranami/contracts';
import type { Track } from '@/stores/types';

/** Done entries sorted into source-playlist order (ascending batchIndex). */
export function orderBatchDone(done: BatchDoneEntry[]): BatchDoneEntry[] {
  return [...done].sort((a, b) => a.batchIndex - b.batchIndex);
}

/**
 * Reconstruct in-flight playlist-import batches from a persisted queue snapshot
 * on app restart. Groups items by `batchId` and re-registers each batch (sealed,
 * membership final) so the coordinator imports the downloaded tracks in order
 * and recreates the playlist — exactly as before the restart. Batch intent
 * (`sourceTitle`, `createPlaylist`) rides on the persisted items. Must run
 * BEFORE the snapshot is applied to the queue store so the coordinator sees the
 * batch the moment it sees the items. Idempotent (the store action no-ops on an
 * existing batch).
 */
export function reconstructBatchesFromSnapshot(items: DownloadQueueItem[]): void {
  const { reconstructBatch } = useDownloadBatchStore.getState();
  const groups = new Map<
    string,
    { sourceTitle: string | null; createPlaylist: boolean; itemIds: string[] }
  >();
  for (const item of items) {
    if (!item.batchId) continue;
    let group = groups.get(item.batchId);
    if (!group) {
      group = {
        sourceTitle: item.batchSourceTitle ?? null,
        createPlaylist: item.batchCreatePlaylist ?? false,
        itemIds: [],
      };
      groups.set(item.batchId, group);
    }
    group.itemIds.push(item.id);
  }
  for (const [batchId, group] of groups) {
    reconstructBatch({ batchId, ...group });
  }
}

/**
 * Fetch the persisted main-process queue and mirror it into the renderer
 * stores: batches first (so the App-level importer sees each batch the instant
 * it sees its items — zustand setState is synchronous), then the queue
 * snapshot. On failure the queue store is flagged so the Downloads view can
 * surface an error state with a retry; any later queue-state broadcast also
 * recovers the snapshot.
 */
export function hydrateDownloadQueue(): void {
  if (!IS_ELECTRON) return;
  window.electronAPI.downloader
    .getDownloadQueue()
    .then(snapshot => {
      reconstructBatchesFromSnapshot(snapshot.items);
      useDownloadQueueStore.getState().applySnapshot(snapshot);
    })
    .catch((err: unknown) => {
      logger.error('[downloads] queue hydration failed', err);
      useDownloadQueueStore.getState().markHydrationFailed();
    });
}

/**
 * The subset of a resolved batch's ids the coordinator may mark imported.
 *
 * A retried item leaves its batch (`batchId` cleared by the queue) and its
 * persisted row becomes live state again — in flight it must survive a
 * restart, and once `done` the single-import path owns forgetting it after
 * the import lands. Either way a late batch resolution must not drop it, so
 * only enqueued ids whose current queue item is still batch-owned — or whose
 * row is already absent — are eligible to forget.
 */
export function batchIdsToForget(
  enqueuedIds: Iterable<string>,
  items: readonly DownloadQueueItem[]
): string[] {
  const byId = new Map(items.map(item => [item.id, item]));
  return [...enqueuedIds].filter(id => {
    const item = byId.get(id);
    return !item || item.batchId != null;
  });
}

export interface BatchImportSummary {
  done: number;
  skipped: number;
  errors: number;
  orderedTrackIds: string[];
}

/**
 * Import a batch's done entries (in source order) into the library and resolve
 * the ordered DB track ids for playlist recreation. Pure-ish: the DB + import
 * effects are injected so this is unit-testable for ordering preservation.
 */
export async function importBatchInOrder(
  done: BatchDoneEntry[],
  failedCount: number,
  deps: {
    exists: (filePath: string) => Promise<boolean>;
    getIdByPath: (filePath: string) => Promise<string | null>;
    importTrack: (filePath: string) => Promise<Track | null>;
    cacheYoutubeId?: (trackId: string, youtubeId: string) => void;
  }
): Promise<BatchImportSummary> {
  const ordered = orderBatchDone(done);
  const orderedTrackIds: string[] = [];
  const seen = new Set<string>();
  const recordId = (id: string | null | undefined) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      orderedTrackIds.push(id);
    }
  };

  let doneCount = 0;
  let skippedCount = 0;
  let errorCount = failedCount;

  for (const entry of ordered) {
    try {
      if (await deps.exists(entry.filePath)) {
        recordId(await deps.getIdByPath(entry.filePath));
        skippedCount++;
        continue;
      }
      const imported = await deps.importTrack(entry.filePath);
      recordId(imported?.id ?? (await deps.getIdByPath(entry.filePath)));
      if (entry.youtubeId && imported) {
        deps.cacheYoutubeId?.(imported.id, entry.youtubeId);
      }
      doneCount++;
    } catch (err) {
      logger.error('[download-queue] batch import failed', err);
      errorCount++;
    }
  }

  return { done: doneCount, skipped: skippedCount, errors: errorCount, orderedTrackIds };
}

/**
 * The single owner of library import for the download queue, mounted once in
 * `App.tsx` (always live, unlike the view-scoped feature hooks). It watches the
 * queue snapshot and:
 *
 *  - For single-download items (no `batchId`): imports each item the first time
 *    it reaches `done`, caches its YouTube id, and shows the success/dup toast.
 *    Items are marked processed *synchronously* before the async import so a
 *    fast second snapshot can never double-import.
 *  - For playlist-import items (with `batchId`): records each terminal item into
 *    the batch store (done filePath / failure) so progress survives a
 *    clear-completed; once the batch is sealed and every enqueued item is
 *    terminal, imports the done ones in `batchIndex` order, preserving source
 *    order, and recreates the playlist. Single-item and batch paths are mutually
 *    exclusive (split on `batchId`) so no item is imported twice.
 *
 * `db.tracks.exists` is the idempotency backstop.
 */
export function useDownloadQueueImporter(): void {
  const { importTrack } = useTrackImport();
  const processedSingleRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!IS_ELECTRON) return;

    const handleSnapshot = () => {
      const { items } = useDownloadQueueStore.getState();
      void runSingleImports(items);
      recordBatchTerminals(items);
      void runBatchCoordination();
    };

    const runSingleImports = async (items: DownloadQueueItem[]) => {
      for (const item of items) {
        if (item.batchId) continue;
        if (item.status !== 'done' || !item.filePath) continue;
        if (processedSingleRef.current.has(item.id)) continue;

        // Mark processed BEFORE awaiting so a faster snapshot can't re-enter.
        processedSingleRef.current.add(item.id);

        try {
          const track = await importTrack(item.filePath);
          if (track) {
            if (item.youtubeId) {
              window.electronAPI.share
                .cacheYoutubeId(track.id, item.youtubeId)
                .catch(err => logger.warn('Failed to cache YouTube id for imported track', err));
            }
            toast.success(i18n.t('downloaded', { ns: 'toast', title: track.title }));
          } else {
            toast.info(i18n.t('trackAlreadyInLibrary', { ns: 'toast' }));
          }
          // Imported (or already present): drop its persisted row so it isn't
          // re-imported on the next launch. On error we keep the row so the
          // import retries after a restart.
          window.electronAPI.downloader
            .markDownloadsImported([item.id])
            .catch(err => logger.warn('[download-queue] markDownloadsImported failed', err));
        } catch (err) {
          logger.error('[download-queue] single import failed', err);
          const msg = err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
          toast.error(i18n.t('downloadFailed', { ns: 'toast', error: msg }));
        }
      }
    };

    // Record each batch item's terminal state into the batch store as it lands,
    // so done files survive a clear-completed before the batch drains.
    const recordBatchTerminals = (items: DownloadQueueItem[]) => {
      const { batches, recordDone, recordFailure } = useDownloadBatchStore.getState();
      for (const item of items) {
        if (!item.batchId || !(item.batchId in batches)) continue;
        if (item.status === 'done' && item.filePath) {
          recordDone(item.batchId, {
            itemId: item.id,
            filePath: item.filePath,
            batchIndex: item.batchIndex ?? 0,
            youtubeId: item.youtubeId,
          });
        } else if (item.status === 'error' || item.status === 'canceled') {
          recordFailure(item.batchId, item.id);
        }
      }
    };

    const runBatchCoordination = async () => {
      const { batches, markResolved, removeBatch } = useDownloadBatchStore.getState();

      for (const batch of Object.values(batches)) {
        if (batch.resolved) continue;
        // Ready only once membership is final (sealed) and every enqueued item
        // has been recorded terminal — robust to enqueue rejects + clear-completed.
        if (!batch.sealed) continue;
        if (batch.enqueuedIds.size === 0) {
          // Nothing actually enqueued (all rejected): drop the empty batch.
          removeBatch(batch.batchId);
          continue;
        }
        if (batch.recordedTerminalIds.size < batch.enqueuedIds.size) continue;

        // Claim synchronously so a later snapshot can't re-run this batch.
        markResolved(batch.batchId);

        try {
          const summary = await importBatchInOrder(batch.done, batch.failedCount, {
            exists: fp => window.electronAPI.db.tracks.exists(fp),
            getIdByPath: fp => window.electronAPI.db.tracks.getIdByPath(fp),
            importTrack,
            cacheYoutubeId: (trackId, youtubeId) =>
              void window.electronAPI.share
                .cacheYoutubeId(trackId, youtubeId)
                .catch(err => logger.warn('Failed to cache YouTube id during batch import', err)),
          });

          toast.success(
            i18n.t('importSummary', {
              ns: 'toast',
              done: summary.done,
              skipped: summary.skipped,
              errors: summary.errors,
            })
          );

          if (batch.createPlaylist && batch.sourceTitle && summary.orderedTrackIds.length > 0) {
            try {
              await window.electronAPI.db.playlists.createWithTracks({
                name: batch.sourceTitle,
                trackIds: summary.orderedTrackIds,
              });
              queryClient.invalidateQueries({ queryKey: playlistKeys.all });
              toast.success(
                i18n.t('playlistCreated', {
                  ns: 'toast',
                  name: batch.sourceTitle,
                  count: summary.orderedTrackIds.length,
                })
              );
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
              toast.error(i18n.t('playlistCreateFailed', { ns: 'toast', error: msg }));
            }
          }
        } catch (err) {
          // The batch was already claimed (markResolved) above, so it won't
          // re-run this session; log rather than leak an unhandled rejection
          // (this fn is invoked fire-and-forget).
          logger.error('[download-queue] batch coordination failed', err);
        } finally {
          // The batch's tracks are imported (idempotent) — drop its persisted
          // rows so they aren't re-imported / its playlist isn't recreated on the
          // next launch. Narrow residual window: a crash after the playlist is
          // created but before this completes would recreate the playlist once on
          // the next boot — accepted as rare and non-corrupting. Only ids still
          // batch-owned (or already absent) are passed — see `batchIdsToForget`.
          window.electronAPI.downloader
            .markDownloadsImported(
              batchIdsToForget(batch.enqueuedIds, useDownloadQueueStore.getState().items)
            )
            .catch(err => logger.warn('[download-queue] markDownloadsImported failed', err));
          removeBatch(batch.batchId);
        }
      }
    };

    handleSnapshot();
    // Subscribe to BOTH stores: queue snapshots advance item status, but the
    // batch's `sealBatch` (which makes a batch eligible to resolve) mutates only
    // the batch store — and may land after the final queue snapshot. Re-running
    // on batch-store changes guarantees the resolution trigger can't be missed.
    const unsubQueue = useDownloadQueueStore.subscribe(handleSnapshot);
    const unsubBatch = useDownloadBatchStore.subscribe(() => void runBatchCoordination());
    return () => {
      unsubQueue();
      unsubBatch();
    };
  }, [importTrack]);
}
