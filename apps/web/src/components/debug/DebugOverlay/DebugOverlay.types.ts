import type { MetricsSnapshot } from '@shiranami/contracts/bindings';
import type { LongTaskEntry, RendererMetrics } from '@/stores/useDebugStore';

export interface IDebugOverlayView {
  /** Backend sampler snapshot (per-process CPU/mem), or null pre-sample. */
  readonly main: MetricsSnapshot | null;
  /** Renderer-side perf aggregate: fps, frame time, heap, timers, render stats, store Hz. */
  readonly renderer: RendererMetrics;
  /** Long-task / slow-event feed, newest first. */
  readonly longTasks: readonly LongTaskEntry[];
  /** Closes the debug panel. */
  readonly close: () => void;
}
