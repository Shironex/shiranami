// Dev-only React render-cost attribution for the Debug Panel.
//
// `<DevProfiler>` (components/debug/DevProfiler.tsx) feeds `recordRender()` on
// every commit, accumulating a per-id `{commits, totalDuration}` map. The
// overlay reads `sampleRenderStats()` on its sampling cadence to show which
// subtree re-renders most often and most expensively — the direct evidence of
// which part of the tree is the "window-open CPU" cost.

export interface RenderStat {
  id: string;
  commits: number;
  /** Sum of React `actualDuration` (ms) over the window. */
  totalDuration: number;
  /** Largest single commit `actualDuration` (ms) seen in the window. */
  maxDuration: number;
}

const stats = new Map<string, RenderStat>();

export function recordRender(id: string, actualDuration: number): void {
  const existing = stats.get(id);
  if (existing) {
    existing.commits += 1;
    existing.totalDuration += actualDuration;
    existing.maxDuration = Math.max(existing.maxDuration, actualDuration);
  } else {
    stats.set(id, {
      id,
      commits: 1,
      totalDuration: actualDuration,
      maxDuration: actualDuration,
    });
  }
}

/** Snapshot the per-id stats sorted by commit count desc, then reset the window. */
export function sampleRenderStats(): RenderStat[] {
  const out = Array.from(stats.values())
    .map(s => ({ ...s }))
    .sort((a, b) => b.commits - a.commits);
  stats.clear();
  return out;
}

export function resetRenderStats(): void {
  stats.clear();
}
