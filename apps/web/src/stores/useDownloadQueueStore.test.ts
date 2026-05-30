import { describe, it, expect, beforeEach } from 'vitest';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import type { DownloadQueueItem } from '@shiranami/contracts';

function item(overrides: Partial<DownloadQueueItem> & { id: string }): DownloadQueueItem {
  return {
    url: `https://example.com/${overrides.id}`,
    title: `Track ${overrides.id}`,
    status: 'queued',
    progress: 0,
    enqueuedAt: 1,
    ...overrides,
  };
}

describe('useDownloadQueueStore', () => {
  beforeEach(() => {
    useDownloadQueueStore
      .getState()
      .applySnapshot({ items: [], maxConcurrency: 3, activeCount: 0 });
  });

  it('rebuilds byUrl + byYoutubeId indices from a snapshot', () => {
    const a = item({ id: 'a', url: 'https://x/a', youtubeId: 'yt-a', status: 'active' });
    const b = item({ id: 'b', url: 'https://x/b', youtubeId: 'yt-b', status: 'done' });
    useDownloadQueueStore.getState().applySnapshot({
      items: [a, b],
      maxConcurrency: 3,
      activeCount: 1,
    });

    const s = useDownloadQueueStore.getState();
    expect(s.getById('a')).toBe(a);
    expect(s.getByUrl('https://x/a')).toBe(a);
    expect(s.getByYoutubeId('yt-b')).toBe(b);
    expect(s.activeCount).toBe(1);
    expect(s.maxConcurrency).toBe(3);
  });

  it('keeps the latest-enqueued item per url (re-download)', () => {
    const oldCanceled = item({ id: 'old', url: 'https://x/dup', status: 'canceled' });
    const fresh = item({ id: 'new', url: 'https://x/dup', status: 'active' });
    // Insertion order = enqueue order; the later item wins.
    useDownloadQueueStore.getState().applySnapshot({
      items: [oldCanceled, fresh],
      maxConcurrency: 3,
      activeCount: 1,
    });

    expect(useDownloadQueueStore.getState().getByUrl('https://x/dup')?.id).toBe('new');
  });

  it('replaces items wholesale on each snapshot', () => {
    useDownloadQueueStore
      .getState()
      .applySnapshot({ items: [item({ id: 'a' })], maxConcurrency: 3, activeCount: 0 });
    useDownloadQueueStore
      .getState()
      .applySnapshot({ items: [item({ id: 'b' })], maxConcurrency: 3, activeCount: 0 });

    const s = useDownloadQueueStore.getState();
    expect(s.items.map(i => i.id)).toEqual(['b']);
    expect(s.getByUrl('https://example.com/a')).toBeUndefined();
  });
});
