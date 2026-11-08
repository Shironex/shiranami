/** 125 -> "2:05". */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Time left, 83 -> "−1:23" (a minus sign, not a hyphen). */
export function formatRemaining(position: number, duration: number): string {
  return `\u2212${formatDuration(Math.max(0, duration - Math.max(0, position)))}`;
}

/** Wall-clock time as "00:47", in the phone's 24 hour style. */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/** "1 song", "214 songs". */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
