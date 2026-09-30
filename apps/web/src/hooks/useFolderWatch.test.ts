import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FoldersChanged } from '@shiranami/contracts';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const rescan = vi.fn<(options?: unknown) => Promise<void>>();
vi.mock('@/hooks/useLibraryRescan', () => ({
  useLibraryRescan: () => ({ rescan }),
}));

import { acquireScanLock, releaseScanLock } from '@/lib/scanLock';
import {
  createFolderRescanQueue,
  FOLDER_WATCH_RETRY_MS,
  useFolderWatch,
} from '@/hooks/useFolderWatch';

/** Resolve pending promise continuations without advancing timers. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('createFolderRescanQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs at once when nothing holds the lock', async () => {
    const run = vi.fn(async () => {});
    const queue = createFolderRescanQueue({ isLocked: () => false, run });

    queue.enqueue(['a', 'b']);
    await flush();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(['a', 'b']);
  });

  it('batches that arrive during its own rescan become one follow-up of their union', async () => {
    let finish: () => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const queue = createFolderRescanQueue({ isLocked: () => false, run });

    queue.enqueue(['a']);
    queue.enqueue(['b']);
    queue.enqueue(['c', 'b']);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await flush();

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(['b', 'c']);
  });

  it('waits for a foreign scan lock, then runs once for everything queued', async () => {
    let locked = true;
    const run = vi.fn(async () => {});
    const queue = createFolderRescanQueue({ isLocked: () => locked, run });

    queue.enqueue(['a']);
    queue.enqueue(['b']);
    await vi.advanceTimersByTimeAsync(FOLDER_WATCH_RETRY_MS * 3);
    expect(run).not.toHaveBeenCalled();

    locked = false;
    await vi.advanceTimersByTimeAsync(FOLDER_WATCH_RETRY_MS);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(['a', 'b']);
  });

  it('a failed rescan does not wedge the queue', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const queue = createFolderRescanQueue({ isLocked: () => false, run });

    queue.enqueue(['a']);
    await flush();
    queue.enqueue(['b']);
    await flush();

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(['b']);
  });

  it('dispose drops pending work and cancels the retry', async () => {
    const run = vi.fn(async () => {});
    const queue = createFolderRescanQueue({ isLocked: () => true, run });

    queue.enqueue(['a']);
    queue.dispose();
    await vi.advanceTimersByTimeAsync(FOLDER_WATCH_RETRY_MS * 5);

    expect(run).not.toHaveBeenCalled();
  });
});

describe('useFolderWatch', () => {
  let emit: (payload: FoldersChanged) => void = () => {};
  const unsubscribe = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    rescan.mockReset();
    rescan.mockResolvedValue(undefined);
    unsubscribe.mockReset();
    window.electronAPI.library.onFoldersChanged = vi.fn(callback => {
      emit = callback;
      return unsubscribe;
    });
  });
  afterEach(() => {
    releaseScanLock();
    delete window.electronAPI.library.onFoldersChanged;
    vi.useRealTimers();
  });

  it('rescans only the reported folders, quietly', async () => {
    renderHook(() => useFolderWatch());

    await act(async () => {
      emit({ folderIds: ['f1', 'f2'] });
      await flush();
    });

    expect(rescan).toHaveBeenCalledTimes(1);
    expect(rescan).toHaveBeenCalledWith({ folderIds: ['f1', 'f2'], quiet: true });
  });

  it('queues while another scan holds the lock and runs when it is released', async () => {
    renderHook(() => useFolderWatch());
    expect(acquireScanLock()).toBe(true);

    await act(async () => {
      emit({ folderIds: ['f1'] });
      emit({ folderIds: ['f2'] });
      await vi.advanceTimersByTimeAsync(FOLDER_WATCH_RETRY_MS * 2);
    });
    expect(rescan).not.toHaveBeenCalled();

    releaseScanLock();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FOLDER_WATCH_RETRY_MS);
    });

    expect(rescan).toHaveBeenCalledTimes(1);
    expect(rescan).toHaveBeenCalledWith({ folderIds: ['f1', 'f2'], quiet: true });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useFolderWatch());
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
