import { describe, it, expect, vi } from 'vitest';
import type { DownloadQueueItem, DownloadQueueSnapshot } from '@shiranami/contracts';
import { DownloadQueue, MAX_CONCURRENCY, type DownloadRunner } from './download-queue';
import type { DownloadQueuePersistence } from './download-queue-persistence';
import type { DownloadProgress } from './yt-dlp-download';

/** A controllable runner: each call exposes resolve/reject + the abort signal. */
interface PendingRun {
  url: string;
  onProgress: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  resolve: (filePath: string) => void;
  reject: (err: unknown) => void;
}

function makeControllableRunner(): { runner: DownloadRunner; runs: PendingRun[] } {
  const runs: PendingRun[] = [];
  const runner: DownloadRunner = (options, onProgress, signal) => {
    return new Promise<string>((resolve, reject) => {
      runs.push({ url: options.url, onProgress, signal, resolve, reject });
    });
  };
  return { runner, runs };
}

/** An in-memory fake persistence that records every call for assertions. */
function makeFakePersistence(seed: DownloadQueueItem[] = [], pausedSeed = false) {
  let pausedFlag = pausedSeed;
  const calls = {
    upsert: [] as DownloadQueueItem[],
    removed: [] as string[],
    cleared: 0,
    pausedSet: [] as boolean[],
  };
  const persistence: DownloadQueuePersistence = {
    load: () => seed,
    // Snapshot the item at call time (the real persistence reads its fields
    // synchronously into a row), so a later in-place mutation by pump() doesn't
    // retroactively change what we recorded.
    upsert: item => calls.upsert.push({ ...item }),
    remove: id => calls.removed.push(id),
    removeMany: ids => calls.removed.push(...ids),
    clear: () => {
      calls.cleared++;
    },
    isPaused: () => pausedFlag,
    setPaused: p => {
      pausedFlag = p;
      calls.pausedSet.push(p);
    },
  };
  return { persistence, calls };
}

function makeQueue(persistence?: DownloadQueuePersistence) {
  const { runner, runs } = makeControllableRunner();
  const snapshots: DownloadQueueSnapshot[] = [];
  const queue = new DownloadQueue({
    getDownloadDir: () => '/tmp/downloads',
    runner,
    broadcast: snapshot => snapshots.push(snapshot),
    persistence,
  });
  return { queue, runs, snapshots };
}

describe('DownloadQueue concurrency gate', () => {
  it(`runs at most ${MAX_CONCURRENCY} downloads at once; the rest stay queued`, () => {
    const { queue, runs } = makeQueue();

    const ids = Array.from({ length: 5 }, (_, i) =>
      queue.enqueue({ url: `https://example.com/${i}`, title: `Track ${i}` })
    );

    // Only MAX_CONCURRENCY runners started; rest are queued.
    expect(runs).toHaveLength(MAX_CONCURRENCY);
    const snap = queue.getSnapshot();
    expect(snap.activeCount).toBe(MAX_CONCURRENCY);
    expect(snap.items.filter(i => i.status === 'active')).toHaveLength(MAX_CONCURRENCY);
    expect(snap.items.filter(i => i.status === 'queued')).toHaveLength(5 - MAX_CONCURRENCY);
    expect(ids).toHaveLength(5);
  });

  it('promotes the next queued item (FIFO) when an active one finishes', async () => {
    const { queue, runs } = makeQueue();

    queue.enqueue({ url: 'https://example.com/0', title: 'Track 0' });
    queue.enqueue({ url: 'https://example.com/1', title: 'Track 1' });
    queue.enqueue({ url: 'https://example.com/2', title: 'Track 2' });
    queue.enqueue({ url: 'https://example.com/3', title: 'Track 3' });

    expect(runs).toHaveLength(3);

    // Finish the first active download.
    runs[0].resolve('/tmp/downloads/track0.mp3');
    await vi.waitFor(() => expect(runs).toHaveLength(4));

    // The 4th (FIFO next) is now active; the finished one is done.
    expect(runs[3].url).toBe('https://example.com/3');
    const snap = queue.getSnapshot();
    expect(snap.activeCount).toBe(3);
    expect(snap.items.find(i => i.url === 'https://example.com/0')?.status).toBe('done');
    expect(snap.items.find(i => i.url === 'https://example.com/0')?.filePath).toBe(
      '/tmp/downloads/track0.mp3'
    );
  });
});

describe('DownloadQueue cancel → canceled vs error', () => {
  it('cancels a queued item directly without starting it', () => {
    const { queue, runs } = makeQueue();
    // Saturate the slots, then enqueue an extra (queued) item.
    for (let i = 0; i < MAX_CONCURRENCY; i++) {
      queue.enqueue({ url: `https://example.com/a${i}`, title: `A${i}` });
    }
    const queuedId = queue.enqueue({ url: 'https://example.com/queued', title: 'Queued' });
    expect(runs).toHaveLength(MAX_CONCURRENCY);

    queue.cancel(queuedId);

    const item = queue.getSnapshot().items.find(i => i.id === queuedId);
    expect(item?.status).toBe('canceled');
    // No runner was ever started for it.
    expect(runs.some(r => r.url === 'https://example.com/queued')).toBe(false);
  });

  it('maps an aborted active download to `canceled`, not `error`', async () => {
    const { queue, runs } = makeQueue();
    const id = queue.enqueue({ url: 'https://example.com/x', title: 'X' });

    expect(runs).toHaveLength(1);
    expect(runs[0].signal?.aborted).toBe(false);

    queue.cancel(id);
    // The abort signal threaded to the runner is now aborted.
    expect(runs[0].signal?.aborted).toBe(true);

    // The runner rejects (as the real one does on abort).
    runs[0].reject(new Error('canceled'));
    await vi.waitFor(() => {
      expect(queue.getSnapshot().items.find(i => i.id === id)?.status).toBe('canceled');
    });
  });

  it('maps a real failure to `error` (signal not aborted)', async () => {
    const { queue, runs } = makeQueue();
    const id = queue.enqueue({ url: 'https://example.com/y', title: 'Y' });

    runs[0].reject(new Error('Video unavailable'));
    await vi.waitFor(() => {
      const item = queue.getSnapshot().items.find(i => i.id === id);
      expect(item?.status).toBe('error');
      expect(item?.error).toBe('Video unavailable');
    });
  });
});

describe('DownloadQueue clearCompleted', () => {
  it('removes only terminal items, leaving active/queued intact', async () => {
    const { queue, runs } = makeQueue();
    queue.enqueue({ url: 'https://example.com/done', title: 'Done' });
    queue.enqueue({ url: 'https://example.com/err', title: 'Err' });
    queue.enqueue({ url: 'https://example.com/active', title: 'Active' });
    const queuedId = queue.enqueue({ url: 'https://example.com/queued', title: 'Queued' });

    runs[0].resolve('/tmp/done.mp3');
    runs[1].reject(new Error('boom'));
    await vi.waitFor(() => {
      const items = queue.getSnapshot().items;
      expect(items.find(i => i.url === 'https://example.com/done')?.status).toBe('done');
      expect(items.find(i => i.url === 'https://example.com/err')?.status).toBe('error');
    });

    queue.clearCompleted();

    const items = queue.getSnapshot().items;
    const urls = items.map(i => i.url);
    expect(urls).toContain('https://example.com/active');
    expect(urls).toContain('https://example.com/queued');
    expect(urls).not.toContain('https://example.com/done');
    expect(urls).not.toContain('https://example.com/err');
    // The formerly-queued item survives clearCompleted (terminal-only removal).
    // It was promoted to active once the two finished items freed slots.
    expect(items.find(i => i.id === queuedId)?.status).toBe('active');
  });
});

describe('DownloadQueue pause / resume', () => {
  it('pause() stops promoting queued items; in-flight downloads keep running', () => {
    const { queue, runs } = makeQueue();
    const id = queue.enqueue({ url: 'https://example.com/a', title: 'A' });
    expect(runs).toHaveLength(1);

    queue.pause();
    expect(queue.getSnapshot().paused).toBe(true);

    // The in-flight download was not aborted.
    expect(runs[0].signal?.aborted).toBe(false);

    // A newly enqueued item stays queued while paused (no runner started).
    queue.enqueue({ url: 'https://example.com/b', title: 'B' });
    expect(runs).toHaveLength(1);
    expect(queue.getSnapshot().items.find(i => i.url === 'https://example.com/b')?.status).toBe(
      'queued'
    );
    expect(id).toBeTruthy();
  });

  it('resume() promotes the queued backlog and clears the paused flag', () => {
    const { queue, runs } = makeQueue();
    queue.pause();
    queue.enqueue({ url: 'https://example.com/a', title: 'A' });
    queue.enqueue({ url: 'https://example.com/b', title: 'B' });
    // Nothing started while paused.
    expect(runs).toHaveLength(0);

    queue.resume();
    expect(queue.getSnapshot().paused).toBe(false);
    expect(runs).toHaveLength(2);
  });

  it('persists the paused flag through pause/resume', () => {
    const { persistence, calls } = makeFakePersistence();
    const { queue } = makeQueue(persistence);
    queue.pause();
    queue.resume();
    expect(calls.pausedSet).toEqual([true, false]);
  });
});

describe('DownloadQueue cancelAll', () => {
  it('aborts every in-flight download, drops all items, and clears persistence', () => {
    const { persistence, calls } = makeFakePersistence();
    const { queue, runs } = makeQueue(persistence);
    queue.enqueue({ url: 'https://example.com/a', title: 'A' });
    queue.enqueue({ url: 'https://example.com/b', title: 'B' });
    expect(runs).toHaveLength(2);

    queue.cancelAll();

    // Every in-flight runner was aborted.
    expect(runs.every(r => r.signal?.aborted)).toBe(true);
    // Queue is empty and persistence cleared.
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(calls.cleared).toBe(1);
  });

  it('resets the paused flag so a fresh enqueue starts normally', () => {
    const { queue, runs } = makeQueue();
    queue.pause();
    queue.cancelAll();
    expect(queue.getSnapshot().paused).toBe(false);

    queue.enqueue({ url: 'https://example.com/c', title: 'C' });
    expect(runs).toHaveLength(1);
  });
});

describe('DownloadQueue hydrateAndResume', () => {
  it('restores persisted items and resumes downloading queued ones', () => {
    const seed: DownloadQueueItem[] = [
      {
        id: 'q1',
        url: 'https://example.com/q1',
        title: 'Q1',
        status: 'queued',
        progress: 0,
        enqueuedAt: 1,
      },
      {
        id: 'd1',
        url: 'https://example.com/d1',
        title: 'D1',
        status: 'done',
        progress: 100,
        filePath: '/tmp/d1.mp3',
        enqueuedAt: 2,
      },
    ];
    const { persistence } = makeFakePersistence(seed);
    const { queue, runs } = makeQueue(persistence);

    queue.hydrateAndResume();

    const items = queue.getSnapshot().items;
    expect(items).toHaveLength(2);
    // The queued item resumed (a runner started); the done item is untouched.
    expect(runs).toHaveLength(1);
    expect(runs[0].url).toBe('https://example.com/q1');
    expect(items.find(i => i.id === 'd1')?.status).toBe('done');
  });

  it('does NOT resume when the persisted queue was paused', () => {
    const seed: DownloadQueueItem[] = [
      {
        id: 'q1',
        url: 'https://example.com/q1',
        title: 'Q1',
        status: 'queued',
        progress: 0,
        enqueuedAt: 1,
      },
    ];
    const { persistence } = makeFakePersistence(seed, /* pausedSeed */ true);
    const { queue, runs } = makeQueue(persistence);

    queue.hydrateAndResume();

    expect(queue.getSnapshot().paused).toBe(true);
    expect(runs).toHaveLength(0);
  });
});

describe('DownloadQueue persistence write-through', () => {
  it('upserts on enqueue and on done; removes on error/cancel', async () => {
    const { persistence, calls } = makeFakePersistence();
    const { queue, runs } = makeQueue(persistence);

    const id = queue.enqueue({ url: 'https://example.com/a', title: 'A' });
    // Enqueue persisted as queued.
    expect(calls.upsert.at(-1)?.id).toBe(id);
    expect(calls.upsert.at(-1)?.status).toBe('queued');

    runs[0].resolve('/tmp/a.mp3');
    await vi.waitFor(() => expect(queue.getSnapshot().items[0]?.status).toBe('done'));
    // Done re-persisted with the resolved path.
    expect(calls.upsert.at(-1)?.status).toBe('done');
    expect(calls.upsert.at(-1)?.filePath).toBe('/tmp/a.mp3');

    const errId = queue.enqueue({ url: 'https://example.com/b', title: 'B' });
    const errRun = runs.find(r => r.url === 'https://example.com/b')!;
    errRun.reject(new Error('boom'));
    await vi.waitFor(() => expect(calls.removed).toContain(errId));
  });

  it('markImported drops the persisted rows for imported items', () => {
    const { persistence, calls } = makeFakePersistence();
    const { queue } = makeQueue(persistence);
    queue.markImported(['x', 'y']);
    expect(calls.removed).toEqual(['x', 'y']);
  });
});

describe('DownloadQueue enqueue metadata', () => {
  it('carries thumbnail + batch intent onto the queued item', () => {
    const { queue } = makeQueue();
    const id = queue.enqueue({
      url: 'https://example.com/a',
      title: 'A',
      thumbnail: 'https://img/a.jpg',
      batchId: 'batch-1',
      batchIndex: 3,
      batchSourceTitle: 'My Playlist',
      batchCreatePlaylist: true,
    });
    const item = queue.getSnapshot().items.find(i => i.id === id);
    expect(item?.thumbnail).toBe('https://img/a.jpg');
    expect(item?.batchSourceTitle).toBe('My Playlist');
    expect(item?.batchCreatePlaylist).toBe(true);
    expect(item?.batchIndex).toBe(3);
  });
});
