import { describe, it, expect } from 'vitest';
import { similarityScore, rankBySimilarity } from './similarity.js';
import type { SimilarityTrack } from './types.js';

const seed: SimilarityTrack = { trackId: 'seed', artist: 'Nujabes', album: 'Modal Soul' };

function candidate(overrides: Partial<SimilarityTrack> = {}): SimilarityTrack {
  return { trackId: 'c', artist: 'Other', album: 'Other Album', ...overrides };
}

describe('similarityScore', () => {
  it('returns 0 for the seed itself', () => {
    expect(similarityScore(seed, { ...seed }, 0)).toBe(0);
  });

  it('scores a shared artist', () => {
    expect(similarityScore(seed, candidate({ artist: 'Nujabes' }), 0)).toBe(3);
  });

  it('scores a shared album', () => {
    expect(similarityScore(seed, candidate({ album: 'Modal Soul' }), 0)).toBe(2);
  });

  it('sums shared artist + album', () => {
    expect(similarityScore(seed, candidate({ artist: 'Nujabes', album: 'Modal Soul' }), 0)).toBe(5);
  });

  it('adds per-shared-playlist points', () => {
    expect(similarityScore(seed, candidate(), 3)).toBe(3);
  });

  it('does NOT match on the Unknown Artist sentinel', () => {
    const unknownSeed: SimilarityTrack = {
      trackId: 'u',
      artist: 'Unknown Artist',
      album: 'Modal Soul',
    };
    const cand = candidate({ artist: 'Unknown Artist', album: 'Other Album' });
    // artist match suppressed; only real signals count → 0 here
    expect(similarityScore(unknownSeed, cand, 0)).toBe(0);
  });

  it('does NOT match on the Unknown Album sentinel', () => {
    const unknownSeed: SimilarityTrack = {
      trackId: 'u',
      artist: 'Nujabes',
      album: 'Unknown Album',
    };
    const cand = candidate({ artist: 'Other', album: 'Unknown Album' });
    expect(similarityScore(unknownSeed, cand, 0)).toBe(0);
  });

  it('does NOT match on empty artist/album', () => {
    const emptySeed: SimilarityTrack = { trackId: 'e', artist: '', album: '' };
    expect(similarityScore(emptySeed, candidate({ artist: '', album: '' }), 0)).toBe(0);
  });

  it('respects custom weights', () => {
    const score = similarityScore(seed, candidate({ artist: 'Nujabes' }), 2, {
      sameArtist: 10,
      perSharedPlaylist: 5,
    });
    expect(score).toBe(10 + 2 * 5);
  });
});

describe('rankBySimilarity', () => {
  const pool: SimilarityTrack[] = [
    { trackId: 'same-artist', artist: 'Nujabes', album: 'Spiritual State' },
    { trackId: 'same-album', artist: 'Cise Starr', album: 'Modal Soul' },
    { trackId: 'unrelated', artist: 'Random', album: 'Random Album' },
    { trackId: 'seed', artist: 'Nujabes', album: 'Modal Soul' },
  ];

  it('ranks by similarity and drops zero-overlap + the seed', () => {
    const ranked = rankBySimilarity(seed, pool);
    expect(ranked.map(t => t.trackId)).toEqual(['same-artist', 'same-album']);
  });

  it('folds in shared-playlist counts', () => {
    const ranked = rankBySimilarity(seed, pool, { unrelated: 4 });
    // unrelated now scores 4 (4 shared playlists), above same-artist (3)
    expect(ranked[0].trackId).toBe('unrelated');
  });

  it('returns [] when nothing overlaps', () => {
    expect(rankBySimilarity(seed, [{ trackId: 'x', artist: 'A', album: 'B' }])).toEqual([]);
  });
});
