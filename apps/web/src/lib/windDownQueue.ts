import type { Track } from '@/stores/types';

/**
 * Reorder the not-yet-played remainder of a queue calmest-first for the
 * wind-down ending, using each track's stored integrated loudness
 * (`loudnessLufs`, EBU R128 — lower/more negative = quieter).
 *
 * Contract:
 *  - Everything up to and including `queueIndex` (already played + the track
 *    playing right now) is untouched — a wind-down never yanks the current
 *    track out from under the listener.
 *  - Analysed tracks sort ascending by LUFS, so the quietest thing left plays
 *    first while the listener is still drifting.
 *  - Un-analysed tracks (`loudnessLufs` null) degrade gracefully: they keep
 *    their existing relative order and follow after every analysed track, so a
 *    half-analysed library still winds down sensibly instead of interleaving
 *    unknowns at random.
 *  - The sort is stable, so equal-loudness tracks keep the order the listener
 *    queued them in.
 *
 * Pure — returns a new array, never mutates the input.
 */
export function orderQueueCalmestFirst(queue: readonly Track[], queueIndex: number): Track[] {
  // queueIndex −1 means nothing is playing yet — the whole queue is upcoming.
  const splitAt = Math.max(0, queueIndex + 1);
  if (splitAt >= queue.length) return [...queue];

  const head = queue.slice(0, splitAt);
  const upcoming = queue.slice(splitAt);

  const analysed = upcoming.filter(track => typeof track.loudnessLufs === 'number');
  const unanalysed = upcoming.filter(track => typeof track.loudnessLufs !== 'number');

  // Array.prototype.sort is spec-stable, which is what keeps equal-LUFS
  // tracks in their queued order.
  const calmestFirst = [...analysed].sort(
    (a, b) => (a.loudnessLufs as number) - (b.loudnessLufs as number)
  );

  return [...head, ...calmestFirst, ...unanalysed];
}
