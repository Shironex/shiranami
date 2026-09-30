import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { IS_ELECTRON } from '@/lib/platform';
import { isScanLocked } from '@/lib/scanLock';
import { useLibraryRescan, type RescanOptions } from '@/hooks/useLibraryRescan';

/** How often a queued batch checks whether someone else's scan has finished. */
export const FOLDER_WATCH_RETRY_MS = 1000;

export interface IFolderRescanQueueDeps {
  /** Whether another scan holds the shared scan lock. */
  isLocked: () => boolean;
  /** Run one scoped rescan. Must take the scan lock synchronously. */
  run: (folderIds: string[]) => Promise<void>;
  retryMs?: number;
}

export interface IFolderRescanQueue {
  /** Add folders from one `library:folders-changed` batch. */
  enqueue: (folderIds: readonly string[]) => void;
  /** Stop: drop anything pending and cancel a scheduled retry. */
  dispose: () => void;
}

/**
 * The folders waiting for a watcher-triggered rescan, and the rule for when
 * that rescan runs.
 *
 * - Nothing running and the lock free: rescan the pending folders now.
 * - Our own rescan running: keep collecting. When it finishes, one follow-up
 *   covers the union of everything that arrived meanwhile.
 * - Someone else's scan holds the lock (the Rescan button, adding a folder):
 *   check again every `retryMs`, then run once for the union.
 *
 * `rescan` returns silently when it cannot take the lock, so the lock is
 * checked here first. The check and `rescan`'s own `acquireScanLock` run in the
 * same synchronous turn, so nothing can take the lock between them.
 */
export function createFolderRescanQueue({
  isLocked,
  run,
  retryMs = FOLDER_WATCH_RETRY_MS,
}: IFolderRescanQueueDeps): IFolderRescanQueue {
  const pending = new Set<string>();
  let running = false;
  let disposed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const pump = async (): Promise<void> => {
    if (disposed || running || pending.size === 0) return;
    if (isLocked()) {
      retry ??= setTimeout(() => {
        retry = undefined;
        void pump();
      }, retryMs);
      return;
    }

    const folderIds = [...pending];
    pending.clear();
    running = true;
    try {
      await run(folderIds);
    } catch (err) {
      logger.error('[folder-watch] rescan failed', err);
    } finally {
      running = false;
    }
    void pump();
  };

  return {
    enqueue: folderIds => {
      if (disposed) return;
      for (const id of folderIds) pending.add(id);
      void pump();
    },
    dispose: () => {
      disposed = true;
      pending.clear();
      if (retry !== undefined) clearTimeout(retry);
    },
  };
}

/**
 * Rescan the folders the shell's watcher reports as changed.
 *
 * Mount once at the app root. The shell only emits while watching is enabled,
 * so this hook needs no setting of its own. No-op outside the desktop shell and
 * on a shell without the channel (the v1 preload has no watcher), which is
 * feature-detected the way `useRadioNowPlayingBridge` does it.
 */
export function useFolderWatch(): void {
  const { rescan } = useLibraryRescan();
  const rescanRef = useRef(rescan);

  useEffect(() => {
    rescanRef.current = rescan;
  }, [rescan]);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    const subscribe = window.electronAPI.library.onFoldersChanged;
    if (!subscribe) return;

    const queue = createFolderRescanQueue({
      isLocked: isScanLocked,
      run: folderIds => {
        const options: RescanOptions = { folderIds, quiet: true };
        return rescanRef.current(options);
      },
    });
    const unsubscribe = subscribe(({ folderIds }) => queue.enqueue(folderIds));

    return () => {
      unsubscribe();
      queue.dispose();
    };
  }, []);
}
