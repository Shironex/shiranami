import { describe, it, expect, vi } from 'vitest';
import type { DownloadQueueSnapshot } from '@shiranami/contracts';
import { DownloadQueue, MAX_CONCURRENCY, type DownloadRunner } from './download-queue';
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

function makeQueue() {
  const { runner, runs } = makeControllableRunner();
  const snapshots: DownloadQueueSnapshot[] = [];
  const queue = new DownloadQueue({
    getDownloadDir: () => '/tmp/downloads',
    runner,
    broadcast: snapshot => snapshots.push(snapshot),
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
