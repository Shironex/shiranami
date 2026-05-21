// Dev-only rAF/interval/timeout registry for the CPU/Perf Debug Panel.
//
// Monkeypatches `requestAnimationFrame`/`cancelAnimationFrame`/`setInterval`/
// `clearInterval`/`setTimeout`/`clearTimeout` to maintain a live count of
// *active* loops, plus the first stack frame per active registration so the
// panel can attribute "renderer CPU is high" to a specific loop ("3 rAF loops
// running, 2 of them visualizers").
//
// SAFETY: the captured `Error().stack` can contain local file paths. These are
// kept RENDERER-LOCAL — read synchronously by the overlay via `getTimerStats()`
// and never sent over IPC or logged. Install once at bootstrap behind the dev
// flag; the wrappers add per-call overhead and must never ship to prod.

export interface ActiveTimer {
  id: number;
  /** Single descriptive stack frame, e.g. "useAudioEngine.ts:422". */
  origin: string;
}

export interface TimerStats {
  activeRaf: number;
  activeIntervals: number;
  activeTimeouts: number;
  rafOrigins: ActiveTimer[];
  intervalOrigins: ActiveTimer[];
}

const activeRaf = new Map<number, string>();
const activeIntervals = new Map<unknown, string>();
const activeTimeouts = new Map<unknown, string>();

let installed = false;

/**
 * Extract the first non-registry stack frame, trimmed to a short
 * `file:line:col` form. Best-effort — returns `'unknown'` when no stack is
 * available (some engines omit it).
 */
function captureOrigin(): string {
  const stack = new Error().stack;
  if (!stack) return 'unknown';
  const lines = stack.split('\n').slice(1);
  for (const line of lines) {
    if (line.includes('timerRegistry')) continue;
    const match = line.match(/([^/\\() ]+\.(?:ts|tsx|js|jsx)[^):]*(?::\d+){0,2})/);
    if (match) return match[1];
  }
  return lines[0]?.trim() ?? 'unknown';
}

export function installTimerRegistry(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origRaf = window.requestAnimationFrame.bind(window);
  const origCancelRaf = window.cancelAnimationFrame.bind(window);
  const origSetInterval = window.setInterval.bind(window);
  const origClearInterval = window.clearInterval.bind(window);
  const origSetTimeout = window.setTimeout.bind(window);
  const origClearTimeout = window.clearTimeout.bind(window);

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const origin = captureOrigin();
    const id = origRaf((ts: number) => {
      activeRaf.delete(id);
      cb(ts);
    });
    activeRaf.set(id, origin);
    return id;
  };

  window.cancelAnimationFrame = (id: number): void => {
    activeRaf.delete(id);
    origCancelRaf(id);
  };

  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const origin = captureOrigin();
    const id = origSetInterval(handler as TimerHandler, timeout, ...args);
    activeIntervals.set(id, origin);
    return id;
  }) as typeof window.setInterval;

  window.clearInterval = ((id?: number) => {
    if (id !== undefined) activeIntervals.delete(id);
    origClearInterval(id);
  }) as typeof window.clearInterval;

  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const origin = captureOrigin();
    const wrapped: TimerHandler =
      typeof handler === 'function'
        ? (...a: unknown[]) => {
            activeTimeouts.delete(id);
            (handler as (...fnArgs: unknown[]) => void)(...a);
          }
        : handler;
    const id = origSetTimeout(wrapped, timeout, ...args);
    activeTimeouts.set(id, origin);
    return id;
  }) as typeof window.setTimeout;

  window.clearTimeout = ((id?: number) => {
    if (id !== undefined) activeTimeouts.delete(id);
    origClearTimeout(id);
  }) as typeof window.clearTimeout;
}

function toOrigins(map: Map<unknown, string>): ActiveTimer[] {
  const counts = new Map<string, number>();
  for (const origin of map.values()) {
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([origin, count], i) => ({ id: i, origin: count > 1 ? `${origin} ×${count}` : origin }))
    .sort((a, b) => a.origin.localeCompare(b.origin));
}

export function getTimerStats(): TimerStats {
  return {
    activeRaf: activeRaf.size,
    activeIntervals: activeIntervals.size,
    activeTimeouts: activeTimeouts.size,
    rafOrigins: toOrigins(activeRaf),
    intervalOrigins: toOrigins(activeIntervals),
  };
}
