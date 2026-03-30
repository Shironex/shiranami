import { describe, expect, it } from 'vitest';
import { shuffleItems } from './playlists';

describe('shuffleItems', () => {
  it('returns a new array, not the same reference', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffleItems(original);
    expect(result).not.toBe(original);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleItems(original);
    expect(original).toEqual(copy);
  });

  it('returns an array with the same length and same elements', () => {
    const original = [10, 20, 30, 40, 50];
    const result = shuffleItems(original);
    expect(result).toHaveLength(original.length);
    expect(result.sort((a, b) => a - b)).toEqual(original.sort((a, b) => a - b));
  });

  it('returns an empty array for empty input', () => {
    expect(shuffleItems([])).toEqual([]);
  });

  it('returns the single element for a single-element array', () => {
    const result = shuffleItems([42]);
    expect(result).toEqual([42]);
  });
});
