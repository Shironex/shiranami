// Wire types for the dev-only CPU/Perf Debug Panel IPC surface.
//
// The shape is defined once here and imported by the main-process sampler
// (apps/desktop/src/main/ipc/debug.ts), the preload bridge
// (apps/desktop/src/main/preload/api/debug.ts), and the renderer store
// (apps/web/src/stores/useDebugStore.ts).
//
// SAFETY: the snapshot carries NUMBERS and process types only. It must never
// include file paths, the userData path, track titles, URLs, process.argv, or
// environment variables. `app.getAppMetrics()` returns pids/types/numbers,
// which are safe to forward.

/**
 * Per-child-process slice from `app.getAppMetrics()`. One entry per Electron
 * process (Browser/GPU/Utility/Renderer/etc.). Splitting CPU by process type is
 * the core signal for attributing the "window open vs background" delta — it
 * separates GPU compositing from renderer JS from the main process.
 */
export interface ProcessMetric {
  /** Electron process type, e.g. 'Browser' | 'GPU' | 'Tab' | 'Utility'. */
  type: string;
  pid: number;
  /** Instantaneous CPU usage as a percentage (0-100, may exceed 100 on multi-core). */
  cpu: number;
  /** Working set size in KB. */
  mem: number;
}

/** Main-process CPU usage from `process.getCPUUsage()` (microseconds + 0-100%). */
export interface MainCpuUsage {
  percentCPUUsage: number;
  idleWakeupsPerSecond: number;
}

/**
 * Main-process V8 heap stats from `process.getHeapStatistics()`. Values are in
 * KB. We forward only the size fields the panel renders — not the full struct.
 */
export interface MainHeapStats {
  totalHeapSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
}

/**
 * Snapshot pushed over `debug:metrics` from main → renderer at ~1 Hz while the
 * panel is open. Numbers and process types only — see the SAFETY note above.
 */
export interface MainMetricsSnapshot {
  /** `Date.now()` when the sample was taken. */
  ts: number;
  cpu: MainCpuUsage;
  heap: MainHeapStats;
  procs: ProcessMetric[];
}
