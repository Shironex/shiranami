import type { MainMetricsSnapshot } from '@shiranami/contracts';
import type { LongTaskEntry, RendererMetrics } from '@/stores/useDebugStore';

export interface IDebugOverlayView {
  /** Main-process sampler snapshot (per-process CPU/mem, heap), or null pre-sample. */
  readonly main: MainMetricsSnapshot | null;
  /** Renderer-side perf aggregate: fps, frame time, heap, timers, render stats, store Hz. */
  readonly renderer: RendererMetrics;
  /** Long-task / slow-event feed, newest first. */
  readonly longTasks: readonly LongTaskEntry[];
  /** Closes the debug panel. */
  readonly close: () => void;
}
