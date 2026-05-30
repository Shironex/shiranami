import { describe, it, expect } from 'vitest';
import { affinityScore, rankByAffinity, selectSeedTracks } from './affinity.js';
import type { TrackStats } from './types.js';

const NOW = Date.parse('2026-05-23T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

function stats(overrides: Partial<TrackStats> = {}): TrackStats {
  return {
    trackId: 't1',
    title: 'Track One',
    artist: 'Artist',
    album: 'Album',
    plays: 10,
    avgCompletion: 1,
    lastPlayedAt: daysAgo(0),
    isFavorite: false,
    ...overrides,
  };
}

describe('affinityScore', () => {
  it('returns 0 for a track with no plays', () => {
    expect(affinityScore(stats({ plays: 0 }), { now: NOW })).toBe(0);
  });

  it('returns 0 for an unparseable lastPlayedAt', () => {
    expect(affinityScore(stats({ lastPlayedAt: 'not-a-date' }), { now: NOW })).toBe(0);
  });

  it('equals plays × completion when played just now (recency ≈ 1)', () => {
    const score = affinityScore(stats({ plays: 8, avgCompletion: 0.5 }), { now: NOW });
    expect(score).toBeCloseTo(8 * 0.5 * 1, 5);
  });

  it('halves the score after one half-life', () => {
    const fresh = affinityScore(stats({ lastPlayedAt: daysAgo(0) }), {
      now: NOW,
      halfLifeDays: 14,
    });
    const aged = affinityScore(stats({ lastPlayedAt: daysAgo(14) }), {
      now: NOW,
      halfLifeDays: 14,
    });
    expect(aged).toBeCloseTo(fresh / 2, 5);
  });

  it('applies the favorite boost multiplicatively', () => {
    const plain = affinityScore(stats({ isFavorite: false }), { now: NOW, favoriteBoost: 0.5 });
    const fav = affinityScore(stats({ isFavorite: true }), { now: NOW, favoriteBoost: 0.5 });
    expect(fav).toBeCloseTo(plain * 1.5, 5);
  });

  it('clamps completion above 1 and below 0', () => {
    const over = affinityScore(stats({ avgCompletion: 5 }), { now: NOW });
    const exact = affinityScore(stats({ avgCompletion: 1 }), { now: NOW });
    expect(over).toBeCloseTo(exact, 5);
    expect(affinityScore(stats({ avgCompletion: -3 }), { now: NOW })).toBe(0);
  });

  it('treats a future timestamp as age 0 (no amplification)', () => {
    const future = affinityScore(stats({ lastPlayedAt: daysAgo(-10) }), { now: NOW });
    const present = affinityScore(stats({ lastPlayedAt: daysAgo(0) }), { now: NOW });
    expect(future).toBeCloseTo(present, 5);
  });

  it('uses the default half-life when given an invalid one', () => {
    const withZero = affinityScore(stats({ lastPlayedAt: daysAgo(14) }), {
      now: NOW,
      halfLifeDays: 0,
    });
    const withDefault = affinityScore(stats({ lastPlayedAt: daysAgo(14) }), { now: NOW });
    expect(withZero).toBeCloseTo(withDefault, 5);
  });

  it('returns 0 for an explicitly disliked track regardless of plays', () => {
    expect(
      affinityScore(stats({ plays: 100, avgCompletion: 1, isDisliked: true }), { now: NOW })
    ).toBe(0);
  });

  it('softly downranks a track whose artist has dislikes (default penalty halves per dislike)', () => {
    const plain = affinityScore(stats({ artistDislikes: 0 }), { now: NOW });
    const one = affinityScore(stats({ artistDislikes: 1 }), { now: NOW });
    const two = affinityScore(stats({ artistDislikes: 2 }), { now: NOW });
    // 1 / (1 + 1×1) = 0.5 ; 1 / (1 + 1×2) = 1/3
    expect(one).toBeCloseTo(plain * 0.5, 5);
    expect(two).toBeCloseTo(plain / 3, 5);
  });

  it('respects a custom artistDislikePenalty', () => {
    const plain = affinityScore(stats({ artistDislikes: 0 }), { now: NOW });
    const damped = affinityScore(stats({ artistDislikes: 2 }), {
      now: NOW,
      artistDislikePenalty: 0.5,
    });
    // 1 / (1 + 0.5×2) = 0.5
    expect(damped).toBeCloseTo(plain * 0.5, 5);
  });

  it('treats a missing/negative artistDislikes as no penalty', () => {
    const plain = affinityScore(stats(), { now: NOW });
    expect(affinityScore(stats({ artistDislikes: -5 }), { now: NOW })).toBeCloseTo(plain, 5);
  });
});

describe('rankByAffinity', () => {
  it('ranks higher-affinity tracks first', () => {
    const ranked = rankByAffinity(
      [
        stats({ trackId: 'low', plays: 1, lastPlayedAt: daysAgo(30) }),
        stats({ trackId: 'high', plays: 50, lastPlayedAt: daysAgo(0) }),
        stats({ trackId: 'mid', plays: 10, lastPlayedAt: daysAgo(7) }),
      ],
      { now: NOW }
    );
    expect(ranked.map(t => t.trackId)).toEqual(['high', 'mid', 'low']);
  });

  it('drops tracks that score 0', () => {
    const ranked = rankByAffinity(
      [stats({ trackId: 'keep' }), stats({ trackId: 'drop', plays: 0 })],
      { now: NOW }
    );
    expect(ranked.map(t => t.trackId)).toEqual(['keep']);
  });

  it('breaks ties by most-recent play', () => {
    // Freeze decay (infinite half-life) so both tracks score identically despite
    // different ages — the recency tie-break on lastPlayedMs then decides order.
    const ranked = rankByAffinity(
      [
        stats({ trackId: 'older', lastPlayedAt: daysAgo(6) }),
        stats({ trackId: 'newer', lastPlayedAt: daysAgo(5) }),
      ],
      { now: NOW, halfLifeDays: Number.POSITIVE_INFINITY }
    );
    expect(ranked.map(t => t.trackId)).toEqual(['newer', 'older']);
  });

  it('does not leak the internal lastPlayedAt field', () => {
    const ranked = rankByAffinity([stats()], { now: NOW });
    expect(ranked[0]).not.toHaveProperty('lastPlayedAt');
    expect(ranked[0]).not.toHaveProperty('lastPlayedMs');
    expect(Object.keys(ranked[0]).sort()).toEqual(
      ['album', 'artist', 'score', 'title', 'trackId'].sort()
    );
  });

  it('returns an empty array for empty input', () => {
    expect(rankByAffinity([], { now: NOW })).toEqual([]);
  });

  it('drops disliked tracks and downranks artist-disliked ones', () => {
    const ranked = rankByAffinity(
      [
        stats({ trackId: 'disliked', plays: 100, isDisliked: true }),
        stats({ trackId: 'artist-hit', plays: 20, artistDislikes: 3 }),
        stats({ trackId: 'clean', plays: 12 }),
      ],
      { now: NOW }
    );
    // disliked dropped; clean (12) outranks artist-hit (20 / (1+3) = 5).
    expect(ranked.map(t => t.trackId)).toEqual(['clean', 'artist-hit']);
  });
});

describe('selectSeedTracks', () => {
  const pool = [
    stats({ trackId: 'a', plays: 100, lastPlayedAt: daysAgo(0) }),
    stats({ trackId: 'b', plays: 50, lastPlayedAt: daysAgo(1) }),
    stats({ trackId: 'c', plays: 10, lastPlayedAt: daysAgo(2) }),
  ];

  it('returns the top-N seeds', () => {
    expect(selectSeedTracks(pool, 2, { now: NOW }).map(t => t.trackId)).toEqual(['a', 'b']);
  });

  it('returns [] when count <= 0', () => {
    expect(selectSeedTracks(pool, 0, { now: NOW })).toEqual([]);
    expect(selectSeedTracks(pool, -1, { now: NOW })).toEqual([]);
  });

  it('returns all available seeds when count exceeds the pool', () => {
    expect(selectSeedTracks(pool, 99, { now: NOW })).toHaveLength(3);
  });
});
