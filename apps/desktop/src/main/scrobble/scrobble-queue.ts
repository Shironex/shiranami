/**
 * Pure retry queue for failed scrobbles.
 *
 * Scrobbling must never block playback and must survive transient network /
 * service failures, so a finished play that fails to submit is parked here and
 * retried later with exponential backoff. This module is the pure state
 * machine — no timers, no fetch; the service drives it (enqueue on failure,
 * `dueItems(now)` on a tick, `markRetried` / `remove` on the result).
 */

/** A parked scrobble awaiting retry. */
export interface QueuedScrobble {
  /** Stable id so the service can correlate submit results back to the item. */
  id: string;
  artist: string;
  track: string;
  album?: string;
  durationSeconds?: number;
  /** Play START timestamp (unix seconds) — preserved so the retry scrobbles
   *  the correct time, not the retry time. */
  startedAt: number;
  /** Which backend(s) still owe this scrobble. Removed as each succeeds. */
  targets: ScrobbleTarget[];
  /** How many submit attempts have been made (drives the backoff). */
  attempts: number;
  /** Earliest unix-ms at which the next attempt may run. */
  nextAttemptAt: number;
}

export type ScrobbleTarget = 'lastfm' | 'listenbrainz';

/** Base backoff in ms; doubles per attempt, capped at {@link MAX_BACKOFF_MS}. */
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
/** Drop a scrobble after this many failed attempts — a play that can't land in
 *  ~17h of backoff is not worth unbounded retention. */
export const MAX_ATTEMPTS = 10;
/** Cap on parked items so a long offline stretch can't grow without bound. */
export const MAX_QUEUE_SIZE = 500;

/** Backoff delay for the Nth attempt (0-based): 1m, 2m, 4m … capped at 1h. */
export function backoffMs(attempts: number): number {
  const delay = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts);
  return Math.min(MAX_BACKOFF_MS, delay);
}

/**
 * Append a failed scrobble, bounded to {@link MAX_QUEUE_SIZE} (oldest dropped
 * first — FIFO eviction). Returns a NEW array; the input is not mutated.
 */
export function enqueue(queue: readonly QueuedScrobble[], item: QueuedScrobble): QueuedScrobble[] {
  const next = [...queue, item];
  if (next.length > MAX_QUEUE_SIZE) next.splice(0, next.length - MAX_QUEUE_SIZE);
  return next;
}

/** Items whose `nextAttemptAt` is due at `now`, oldest start first. */
export function dueItems(queue: readonly QueuedScrobble[], now: number): QueuedScrobble[] {
  return queue.filter(item => item.nextAttemptAt <= now).sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * After a failed retry: bump the attempt count and reschedule with backoff, or
 * drop the item once it exhausts {@link MAX_ATTEMPTS} (and/or has no remaining
 * targets). Returns a NEW queue.
 */
export function markRetried(
  queue: readonly QueuedScrobble[],
  id: string,
  remainingTargets: ScrobbleTarget[],
  now: number
): QueuedScrobble[] {
  return queue.flatMap(item => {
    if (item.id !== id) return [item];
    const attempts = item.attempts + 1;
    if (attempts >= MAX_ATTEMPTS || remainingTargets.length === 0) return [];
    return [
      {
        ...item,
        targets: remainingTargets,
        attempts,
        nextAttemptAt: now + backoffMs(attempts),
      },
    ];
  });
}

/** Remove a fully-submitted item. Returns a NEW queue. */
export function remove(queue: readonly QueuedScrobble[], id: string): QueuedScrobble[] {
  return queue.filter(item => item.id !== id);
}
