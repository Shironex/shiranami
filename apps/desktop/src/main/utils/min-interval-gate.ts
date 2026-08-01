/**
 * Serializes async operations with a minimum spacing between them.
 *
 * Guarantees:
 * - Only one `fn` runs at a time (FIFO order preserved).
 * - At least `minIntervalMs` elapses between the completion of one `fn` and
 *   the start of the next.
 * - A rejecting `fn` does NOT stall the queue — the tail chain always
 *   continues, and `nextAllowedAt` is still advanced in `finally`.
 * - `bumpBy(ms)` lets callers extend the next allowed start time to honor
 *   server-dictated backoffs (e.g. `Retry-After`).
 */
export interface MinIntervalGateOptions {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class MinIntervalGate {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private tail: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;

  constructor(options: MinIntervalGateOptions) {
    this.minIntervalMs = options.minIntervalMs;
    // Monotonic clock so gate spacing is immune to wall-clock jumps (NTP,
    // manual changes). Retry-After / X-RateLimit-Reset values are parsed as
    // durations against wall clock, then fed to `bumpBy`, which adds the
    // duration to the monotonic clock — durations are clock-agnostic, so
    // correctness holds either way.
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    const runSlot = this.tail.then(async () => {
      const wait = Math.max(0, this.nextAllowedAt - this.now());
      if (wait > 0) await this.sleep(wait);
      try {
        return await fn();
      } finally {
        // Use max() so a bumpBy() called during `fn` (e.g. from a 429
        // handler inside the wrapped op) isn't clobbered by the baseline
        // interval.
        this.nextAllowedAt = Math.max(this.nextAllowedAt, this.now() + this.minIntervalMs);
      }
    });
    // Keep the tail chain alive even if the slot rejects.
    this.tail = runSlot.then(
      () => undefined,
      () => undefined
    );
    return runSlot;
  }

  /**
   * Extend the next allowed start time by at least `ms` from now.
   * Never shortens an already-scheduled delay.
   */
  bumpBy(ms: number): void {
    this.nextAllowedAt = Math.max(this.nextAllowedAt, this.now() + ms);
  }
}
