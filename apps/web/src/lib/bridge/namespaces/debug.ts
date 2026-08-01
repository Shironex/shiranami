import { IPC_CHANNELS, type DebugApi, type MainMetricsSnapshot } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { debugMetrics } from '../narrowers';

const C = IPC_CHANNELS.debug;

/**
 * `debug:metrics` is the one channel whose **payload shape** differs from v1's,
 * and it is a recorded loss rather than a port gap: §2.2
 * and `crate::commands::debug` state that there is no Chromium process registry to
 * label a process `Browser`/`GPU`, and no V8 in the backend to report a heap
 * for. v2 sends `{ ts, procs: [{ kind, pid, cpu, mem }] }` where v1 sent
 * `{ ts, cpu, heap, procs: [{ type, pid, cpu, mem }] }`.
 *
 * The shim forwards what the backend actually produces rather than fabricating
 * the missing halves — a synthesised `heap: { usedHeapSize: 0, … }` would render
 * as a real zero in the overlay, and mapping `kind` onto Electron's process
 * vocabulary would invent a `GPU` process that does not exist. So the assertion
 * is confined to this one line, and `components/debug/DebugOverlay` is the piece
 * that has to catch up: it reads `main.cpu.percentCPUUsage` and `main.heap`,
 * neither of which now arrives.
 *
 * Dev-only surface, gated behind `debug.start()`, which is why it is reported
 * rather than reshaped here — what the overlay should show instead is a UI
 * decision, not a transport one.
 */
type MetricsCallback = (snapshot: MainMetricsSnapshot) => void;

export const debugApi: DebugApi = {
  start: async () => {
    await commands.debugStart();
  },
  stop: async () => {
    await commands.debugStop();
  },
  onMetrics: (callback: MetricsCallback) =>
    subscribeChannel<MainMetricsSnapshot>(C.metrics, events.debugMetrics, debugMetrics, callback),
};
