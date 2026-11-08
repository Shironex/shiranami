/** Fade length before the timer pauses playback. */
export const FADE_MS = 2 * 60_000;

export const SLEEP_PRESETS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 45, label: '45 minutes' },
  { minutes: 60, label: '1 hour' },
] as const;

export function remainingMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

/**
 * Output level while the timer runs: full until the last two minutes, then
 * down to silence. Squared, because loudness is heard roughly
 * logarithmically and a linear ramp sounds like it drops off at the end.
 */
export function fadeLevel(remaining: number, fade: boolean): number {
  if (!fade || remaining >= FADE_MS) return 1;
  const t = Math.max(0, remaining) / FADE_MS;
  return t * t;
}

export interface SleepStep {
  remaining: number;
  level: number;
  expired: boolean;
}

/** What the timer should do at `now`. Pure, so it can run from any clock tick. */
export function sleepStep(endsAt: number, now: number, fade: boolean): SleepStep {
  const remaining = remainingMs(endsAt, now);
  return { remaining, level: fadeLevel(remaining, fade), expired: remaining <= 0 };
}

/** The player's Sleep button label while a timer runs: "24 min", rounded up. */
export function sleepLabel(remaining: number): string {
  return `${Math.max(1, Math.ceil(remaining / 60_000))} min`;
}
