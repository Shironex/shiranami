import { describe, expect, it } from 'vitest';
import { orderQueueCalmestFirst } from './windDownQueue';
import type { Track } from '@/stores/types';

function makeTrack(id: string, loudnessLufs: number | null | undefined): Track {
  return {
    id,
    title: id,
    artist: 'Aoi',
    album: 'Nocturne',
    duration: 200,
    filePath: `/music/${id}.mp3`,
    loudnessLufs,
  };
}

const ids = (tracks: readonly Track[]) => tracks.map(track => track.id);

describe('orderQueueCalmestFirst', () => {
  it('sorts the upcoming tracks ascending by LUFS (calmest first)', () => {
    const queue = [
      makeTrack('current', -12),
      makeTrack('loud', -8),
      makeTrack('calm', -22),
      makeTrack('mid', -15),
    ];

    expect(ids(orderQueueCalmestFirst(queue, 0))).toEqual(['current', 'calm', 'mid', 'loud']);
  });

  it('never reorders the current track or anything already played', () => {
    const queue = [
      makeTrack('played-loud', -5),
      makeTrack('current', -9),
      makeTrack('loud', -6),
      makeTrack('calm', -20),
    ];

    expect(ids(orderQueueCalmestFirst(queue, 1))).toEqual([
      'played-loud',
      'current',
      'calm',
      'loud',
    ]);
  });

  it('places un-analysed tracks after every analysed one, keeping their order', () => {
    const queue = [
      makeTrack('current', -14),
      makeTrack('unknown-a', null),
      makeTrack('loud', -7),
      makeTrack('unknown-b', undefined),
      makeTrack('calm', -19),
    ];

    expect(ids(orderQueueCalmestFirst(queue, 0))).toEqual([
      'current',
      'calm',
      'loud',
      'unknown-a',
      'unknown-b',
    ]);
  });

  it('keeps queued order for equal-loudness tracks (stable sort)', () => {
    const queue = [
      makeTrack('current', -10),
      makeTrack('first', -16),
      makeTrack('second', -16),
      makeTrack('third', -16),
    ];

    expect(ids(orderQueueCalmestFirst(queue, 0))).toEqual(['current', 'first', 'second', 'third']);
  });

  it('sorts the whole queue when nothing is playing yet (index −1)', () => {
    const queue = [makeTrack('loud', -6), makeTrack('calm', -21)];

    expect(ids(orderQueueCalmestFirst(queue, -1))).toEqual(['calm', 'loud']);
  });

  it('returns a copy and leaves the input untouched', () => {
    const queue = [makeTrack('current', -10), makeTrack('loud', -6), makeTrack('calm', -21)];
    const before = ids(queue);

    const result = orderQueueCalmestFirst(queue, 0);

    expect(result).not.toBe(queue);
    expect(ids(queue)).toEqual(before);
  });

  it('handles an empty queue and a fully-played queue', () => {
    expect(orderQueueCalmestFirst([], -1)).toEqual([]);

    const queue = [makeTrack('a', -10), makeTrack('b', -20)];
    expect(ids(orderQueueCalmestFirst(queue, 1))).toEqual(['a', 'b']);
  });

  it('winds down an entirely un-analysed queue without reordering it', () => {
    const queue = [makeTrack('current', null), makeTrack('a', null), makeTrack('b', undefined)];

    expect(ids(orderQueueCalmestFirst(queue, 0))).toEqual(['current', 'a', 'b']);
  });
});
