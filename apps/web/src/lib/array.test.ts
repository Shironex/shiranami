import { describe, it, expect } from 'vitest';
import { arrayMove } from './array';

describe('arrayMove', () => {
  it('moves an item forward (lower → higher index)', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward (higher → lower index)', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves to adjacent slots', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(arrayMove(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op when from === to', () => {
    expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('moves to the first and last slots', () => {
    expect(arrayMove(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('treats a negative target as an offset from the end (splice semantics)', () => {
    // The target index is computed from the array length before the item is
    // spliced out, matching dnd-kit: 4 + (-1) = 3, so 'a' lands at the end.
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, -1)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c'];
    const result = arrayMove(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(input);
  });

  // Guard against regressing away from dnd-kit's exact behavior: reproduce its
  // reference implementation and assert parity across every from/to pair.
  it('matches @dnd-kit/sortable arrayMove for every index pair', () => {
    const reference = <T>(array: readonly T[], from: number, to: number): T[] => {
      const newArray = array.slice();
      newArray.splice(to < 0 ? newArray.length + to : to, 0, newArray.splice(from, 1)[0]!);
      return newArray;
    };
    const base = ['a', 'b', 'c', 'd', 'e'];
    for (let from = 0; from < base.length; from++) {
      for (let to = 0; to < base.length; to++) {
        expect(arrayMove(base, from, to)).toEqual(reference(base, from, to));
      }
    }
  });
});
