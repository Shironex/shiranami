import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  batchIdsToForget,
  importBatchInOrder,
  orderBatchDone,
} from '@/hooks/useDownloadQueueImporter';
import type { BatchDoneEntry } from '@/stores/useDownloadBatchStore';
import type { DownloadQueueItem } from '@shiranami/contracts';
import type { Track } from '@/stores/types';

function done(batchIndex: number, filePath: string, youtubeId?: string): BatchDoneEntry {
  return { itemId: `item-${batchIndex}`, filePath, batchIndex, youtubeId };
}

function makeTrack(id: string, filePath: string): Track {
  return {
    id,
    title: filePath,
    artist: 'A',
    album: 'B',
    duration: 100,
    filePath,
  } as Track;
}

describe('batchIdsToForget', () => {
  function queueItem(id: string, overrides: Partial<DownloadQueueItem> = {}): DownloadQueueItem {
    return {
      id,
      url: `https://youtu.be/${id}`,
      title: id,
      status: 'done',
      progress: 100,
      enqueuedAt: 0,
      batchId: 'b1',
      batchIndex: 0,
      ...overrides,
    };
  }

  it('keeps batch-owned and already-removed ids but drops retried ones', () => {
    const items = [
      queueItem('done-member'),
      // A retried item left the batch: its row is live state again (in flight)
      // or awaits the single-import path's own mark-imported (done) — either
      // way the coordinator must not forget it.
      queueItem('retried', { batchId: undefined, batchIndex: undefined, status: 'active' }),
    ];

    const ids = batchIdsToForget(new Set(['done-member', 'retried', 'already-gone']), items);

    expect(ids).toEqual(['done-member', 'already-gone']);
  });
});

describe('orderBatchDone', () => {
  it('sorts done entries ascending by batchIndex', () => {
    const ordered = orderBatchDone([done(2, '/c.mp3'), done(0, '/a.mp3'), done(1, '/b.mp3')]);
    expect(ordered.map(e => e.batchIndex)).toEqual([0, 1, 2]);
  });
});

describe('importBatchInOrder', () => {
  it('imports out-of-order completions in source (batchIndex) order', async () => {
    // Completions arrive shuffled; orderedTrackIds must follow batchIndex.
    const entries = [done(2, '/c.mp3'), done(0, '/a.mp3'), done(1, '/b.mp3')];
    const idByPath: Record<string, string> = {
      '/a.mp3': 'track-a',
      '/b.mp3': 'track-b',
      '/c.mp3': 'track-c',
    };

    const summary = await importBatchInOrder(entries, 0, {
      exists: async () => false,
      getIdByPath: async fp => idByPath[fp] ?? null,
      importTrack: async fp => makeTrack(idByPath[fp], fp),
    });

    expect(summary.orderedTrackIds).toEqual(['track-a', 'track-b', 'track-c']);
    expect(summary.done).toBe(3);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toBe(0);
  });

  it('resolves already-existing tracks by path and counts them as skipped', async () => {
    const summary = await importBatchInOrder([done(0, '/a.mp3'), done(1, '/b.mp3')], 0, {
      exists: async fp => fp === '/a.mp3',
      getIdByPath: async fp => (fp === '/a.mp3' ? 'existing-a' : 'track-b'),
      importTrack: async fp => makeTrack('track-b', fp),
    });

    // Order preserved: existing /a.mp3 first, then imported /b.mp3.
    expect(summary.orderedTrackIds).toEqual(['existing-a', 'track-b']);
    expect(summary.skipped).toBe(1);
    expect(summary.done).toBe(1);
  });

  it('still produces an ordered playlist when one item failed to download', async () => {
    // batchIndex 1 errored during download (not present in `done`); the rest
    // still import in order, and the failure count carries through.
    const entries = [done(2, '/c.mp3'), done(0, '/a.mp3')];
    const idByPath: Record<string, string> = { '/a.mp3': 'track-a', '/c.mp3': 'track-c' };

    const summary = await importBatchInOrder(entries, 1, {
      exists: async () => false,
      getIdByPath: async fp => idByPath[fp] ?? null,
      importTrack: async fp => makeTrack(idByPath[fp], fp),
    });

    expect(summary.orderedTrackIds).toEqual(['track-a', 'track-c']);
    expect(summary.done).toBe(2);
    expect(summary.errors).toBe(1);
  });

  it('counts an import throw as an error without aborting the rest', async () => {
    const entries = [done(0, '/a.mp3'), done(1, '/b.mp3')];

    const summary = await importBatchInOrder(entries, 0, {
      exists: async () => false,
      getIdByPath: async () => 'track-b',
      importTrack: async fp => {
        if (fp === '/a.mp3') throw new Error('import boom');
        return makeTrack('track-b', fp);
      },
    });

    expect(summary.errors).toBe(1);
    expect(summary.done).toBe(1);
    expect(summary.orderedTrackIds).toEqual(['track-b']);
  });

  it('caches the youtube id for newly imported tracks', async () => {
    const cacheYoutubeId = vi.fn();
    await importBatchInOrder([done(0, '/a.mp3', 'yt-123')], 0, {
      exists: async () => false,
      getIdByPath: async () => 'track-a',
      importTrack: async fp => makeTrack('track-a', fp),
      cacheYoutubeId,
    });
    expect(cacheYoutubeId).toHaveBeenCalledWith('track-a', 'yt-123');
  });
});
