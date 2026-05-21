// Main-process metrics sampler for the dev-only CPU/Perf Debug Panel.
//
// While active (between `debug:start` and `debug:stop`) it polls
// `app.getAppMetrics()` + `process.getCPUUsage()` + `process.getHeapStatistics()`
// at ~1 Hz and pushes a `debug:metrics` snapshot to the renderer, mirroring the
// `webContents.send` progress pattern in downloader.ts. The interval is
// `.unref()`-ed (matching logger.ts) so it never holds the event loop open.
//
// SAFETY (see observability report 2026-05-21):
//  - Sample at 1 Hz, never per-frame; the monitor must not become the load it
//    measures.
//  - Only sample while the panel is open — start on `debug:start`, stop on
//    `debug:stop`. Closing the panel clears the interval so there is zero
//    self-inflicted CPU when the overlay is closed.
//  - Do NOT log per-tick (it would blow up the rotating file logger). Emit a
//    single `info` heartbeat on start/stop only.
//  - The snapshot carries numbers + process types only — no paths, titles,
//    URLs, argv, or env.

import { app, ipcMain } from 'electron';
import { IPC_CHANNELS, type MainMetricsSnapshot } from '@shiranami/contracts';
import { logger } from '../logger';
import { getMainWindow } from '../utils/window';
import { handle } from './with-ipc-handler';
import { debugStartArgs, debugStopArgs } from './schemas/debug';

const C = IPC_CHANNELS.debug;
const SAMPLE_INTERVAL_MS = 1000;

let timer: ReturnType<typeof setInterval> | null = null;

function sample(): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  const cpu = process.getCPUUsage();
  const heap = process.getHeapStatistics();
  const procs = app.getAppMetrics().map(m => ({
    type: m.type,
    pid: m.pid,
    cpu: m.cpu.percentCPUUsage,
    mem: m.memory.workingSetSize,
  }));

  const snapshot: MainMetricsSnapshot = {
    ts: Date.now(),
    cpu: {
      percentCPUUsage: cpu.percentCPUUsage,
      idleWakeupsPerSecond: cpu.idleWakeupsPerSecond,
    },
    heap: {
      totalHeapSize: heap.totalHeapSize,
      usedHeapSize: heap.usedHeapSize,
      heapSizeLimit: heap.heapSizeLimit,
    },
    procs,
  };

  win.webContents.send(C.metrics, snapshot);
}

function startSampling(): void {
  if (timer) return;
  logger.info('[debug] metrics sampling started');
  timer = setInterval(sample, SAMPLE_INTERVAL_MS);
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
}

function stopSampling(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info('[debug] metrics sampling stopped');
}

export function registerDebugHandlers(): void {
  handle(C.start, () => startSampling(), { schema: debugStartArgs });
  handle(C.stop, () => stopSampling(), { schema: debugStopArgs });
}

export function cleanupDebugHandlers(): void {
  stopSampling();
  ipcMain.removeHandler(C.start);
  ipcMain.removeHandler(C.stop);
}
