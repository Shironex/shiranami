import { describe, it, expect } from 'vitest';
import {
  enqueue,
  dueItems,
  markRetried,
  remove,
  backoffMs,
  MAX_ATTEMPTS,
  MAX_QUEUE_SIZE,
  type QueuedScrobble,
} from './scrobble-queue';

function item(overrides: Partial<QueuedScrobble> = {}): QueuedScrobble {
  return {
    id: 'i1',
    artist: 'A',
    track: 'T',
    startedAt: 1000,
    targets: ['lastfm', 'listenbrainz'],
    attempts: 0,
    nextAttemptAt: 0,
    ...overrides,
  };
}

describe('backoffMs', () => {
  it('doubles per attempt and caps at one hour', () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(1)).toBe(120_000);
    expect(backoffMs(99)).toBe(60 * 60 * 1000);
  });
});

describe('enqueue', () => {
  it('appends without mutating the input', () => {
    const q: QueuedScrobble[] = [];
    const next = enqueue(q, item());
    expect(q).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('evicts oldest beyond the cap', () => {
    let q: QueuedScrobble[] = [];
    for (let i = 0; i < MAX_QUEUE_SIZE + 5; i += 1) {
      q = enqueue(q, item({ id: `i${i}`, startedAt: i }));
    }
    expect(q).toHaveLength(MAX_QUEUE_SIZE);
    expect(q[0].id).toBe('i5');
  });
});

describe('dueItems', () => {
  it('returns only items due at now, oldest start first', () => {
    const q = [
      item({ id: 'late', nextAttemptAt: 5000, startedAt: 1 }),
      item({ id: 'due-new', nextAttemptAt: 100, startedAt: 20 }),
      item({ id: 'due-old', nextAttemptAt: 100, startedAt: 10 }),
    ];
    expect(dueItems(q, 1000).map(i => i.id)).toEqual(['due-old', 'due-new']);
  });
});

describe('markRetried', () => {
  it('bumps attempts and reschedules with backoff', () => {
    const q = [item({ id: 'x', attempts: 0 })];
    const next = markRetried(q, 'x', ['lastfm'], 10_000);
    expect(next[0].attempts).toBe(1);
    expect(next[0].targets).toEqual(['lastfm']);
    expect(next[0].nextAttemptAt).toBe(10_000 + backoffMs(1));
  });

  it('drops the item when targets are exhausted', () => {
    const next = markRetried([item({ id: 'x' })], 'x', [], 0);
    expect(next).toHaveLength(0);
  });

  it('drops the item after MAX_ATTEMPTS', () => {
    const next = markRetried([item({ id: 'x', attempts: MAX_ATTEMPTS - 1 })], 'x', ['lastfm'], 0);
    expect(next).toHaveLength(0);
  });
});

describe('remove', () => {
  it('removes the matching item', () => {
    const q = [item({ id: 'a' }), item({ id: 'b' })];
    expect(remove(q, 'a').map(i => i.id)).toEqual(['b']);
  });
});
