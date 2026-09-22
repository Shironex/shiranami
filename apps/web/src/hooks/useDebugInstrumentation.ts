// Dev-only renderer instrumentation for the CPU/Perf Debug Panel.
//
// Mounted (via `useDebugBridge`) ONLY while the overlay is open, so React does
// not even create the observers/loops otherwise. While active it:
//  - runs a single rAF loop measuring FPS + p95 frame time (a continuous loop,
//    NOT gated on intersection — it must keep measuring when backgrounded so
//    the open-vs-background delta is visible),
//  - reads `performance.memory.usedJSHeapSize` (Chromium-only, null-guarded),
//  - observes `longtask`/`event` PerformanceEntries over a threshold,
//  - aggregates the timer registry, render stats, and store-Hz counters,
//  - pushes a renderer snapshot to the debug store at ~2 Hz (never per-frame),
//  - starts/stops the main-process sampler over IPC and subscribes to its push.
//
// All capture stays renderer-local except the numeric main snapshot; timer
// origin stacks are never sent over IPC (see timerRegistry SAFETY note).

import { useEffect } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { getTimerStats } from '@/lib/debug/timerRegistry';
import { sampleRenderStats, resetRenderStats } from '@/lib/debug/renderStats';
import { startStoreHz, stopStoreHz, sampleStoreHz } from '@/lib/debug/storeHz';
import { useDebugStore, type LongTaskEntry } from '@/stores/useDebugStore';

const PUSH_INTERVAL_MS = 500; // ~2 Hz
const LONG_TASK_THRESHOLD_MS = 50;

interface ChromeMemory {
  usedJSHeapSize: number;
}

function readJsHeap(): number | null {
  const mem = (performance as Performance & { memory?: ChromeMemory }).memory;
  return mem ? mem.usedJSHeapSize : null;
}

/** p95 of a numeric sample array. */
function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

export function useDebugInstrumentation(active: boolean): void {
  // Backend sampler bridge: start sampling on open, stop on close.
  useEffect(() => {
    if (!active || !IS_ELECTRON) return;
    const setMain = useDebugStore.getState().setMain;
    // `electronAPI.debug` is typed by v1's frozen `DebugApi`, whose snapshot
    // still carries `cpu`, `heap` and a Chromium process `type`. v2 sends
    // `{ ts, procs: [{ kind, … }] }` — an accepted §2.2 loss, not a gap — and
    // the bridge validates that shape at runtime before this callback ever
    // runs (`lib/bridge/narrowers.ts`). This is one half of the pair of
    // assertions that carry the payload across the frozen contract; the other
    // is in `lib/bridge/namespaces/debug.ts`. Both disappear with the contract
    // at cutover.
    const unsubscribe = window.electronAPI.debug.onMetrics(
      setMain as unknown as Parameters<typeof window.electronAPI.debug.onMetrics>[0]
    );
    void window.electronAPI.debug.start();
    return () => {
      unsubscribe();
      void window.electronAPI.debug.stop();
    };
  }, [active]);

  // Renderer-side loops + observers.
  useEffect(() => {
    if (!active) return;

    startStoreHz();
    resetRenderStats();

    let rafId = 0;
    let frameCount = 0;
    const frameTimes: number[] = [];
    let lastFrameTs = performance.now();
    let lastFpsTs = lastFrameTs;
    let fps = 0;

    const loop = () => {
      const now = performance.now();
      const delta = now - lastFrameTs;
      lastFrameTs = now;
      frameCount += 1;
      frameTimes.push(delta);
      if (now - lastFpsTs >= 1000) {
        fps = Math.round((frameCount * 1000) / (now - lastFpsTs));
        frameCount = 0;
        lastFpsTs = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const pushLongTask = useDebugStore.getState().pushLongTask;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration < LONG_TASK_THRESHOLD_MS) continue;
          const item: LongTaskEntry = {
            ts: Date.now(),
            kind: entry.entryType,
            duration: Math.round(entry.duration),
            name: entry.name,
          };
          pushLongTask(item);
        }
      });
      observer.observe({ entryTypes: ['longtask', 'event'] });
    } catch {
      observer = null;
    }

    const pushTimer = window.setInterval(() => {
      const setRenderer = useDebugStore.getState().setRenderer;
      const frameP95 = Math.round(p95(frameTimes) * 100) / 100;
      frameTimes.length = 0;
      setRenderer({
        fps,
        frameP95,
        jsHeap: readJsHeap(),
        timers: getTimerStats(),
        renderStats: sampleRenderStats(),
        storeHz: sampleStoreHz(),
      });
    }, PUSH_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.clearInterval(pushTimer);
      stopStoreHz();
      useDebugStore.getState().reset();
    };
  }, [active]);
}
