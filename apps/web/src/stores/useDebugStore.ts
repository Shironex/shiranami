import { create } from 'zustand';
import type { MetricsSnapshot } from '@shiranami/contracts/bindings';
import type { TimerStats } from '@/lib/debug/timerRegistry';
import type { RenderStat } from '@/lib/debug/renderStats';

/** A long-task / slow-event entry captured by the renderer PerformanceObserver. */
export interface LongTaskEntry {
  ts: number;
  /** 'longtask' | 'event' (the PerformanceEntry.entryType). */
  kind: string;
  /** Duration in ms. */
  duration: number;
  /** Entry name (e.g. the event type for 'event' entries). */
  name: string;
}

/** Renderer-side perf aggregate pushed to the store ~2x/sec. */
export interface RendererMetrics {
  fps: number;
  /** p95 frame time over the last window (ms). */
  frameP95: number;
  /** `performance.memory.usedJSHeapSize` in bytes, or null when unavailable. */
  jsHeap: number | null;
  timers: TimerStats | null;
  renderStats: RenderStat[];
  storeHz: Record<string, number>;
}

const EMPTY_RENDERER: RendererMetrics = {
  fps: 0,
  frameP95: 0,
  jsHeap: null,
  timers: null,
  renderStats: [],
  storeHz: {},
};

const MAX_LONG_TASKS = 30;

interface DebugState {
  open: boolean;
  main: MetricsSnapshot | null;
  renderer: RendererMetrics;
  longTasks: LongTaskEntry[];
}

interface DebugActions {
  toggle: () => void;
  close: () => void;
  setMain: (snapshot: MetricsSnapshot) => void;
  setRenderer: (metrics: RendererMetrics) => void;
  pushLongTask: (entry: LongTaskEntry) => void;
  reset: () => void;
}

export const useDebugStore = create<DebugState & DebugActions>(set => ({
  open: false,
  main: null,
  renderer: EMPTY_RENDERER,
  longTasks: [],

  toggle: () => set(s => ({ open: !s.open })),
  close: () => set({ open: false }),
  setMain: snapshot => set({ main: snapshot }),
  setRenderer: metrics => set({ renderer: metrics }),
  pushLongTask: entry =>
    set(s => ({ longTasks: [entry, ...s.longTasks].slice(0, MAX_LONG_TASKS) })),
  reset: () => set({ main: null, renderer: EMPTY_RENDERER, longTasks: [] }),
}));

if (import.meta.hot) {
  type HmrData = { store?: typeof useDebugStore };
  const hot = import.meta.hot;
  const data = (hot.data ?? {}) as HmrData;
  if (data.store) {
    useDebugStore.setState(data.store.getState());
  }
  data.store = useDebugStore;
  hot.accept();
}
