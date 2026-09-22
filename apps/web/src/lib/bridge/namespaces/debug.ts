import { IPC_CHANNELS, type DebugApi } from '@shiranami/contracts';
import { events, type MetricsSnapshot } from '@shiranami/contracts/bindings';
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
 * vocabulary would invent a `GPU` process that does not exist.
 *
 * `components/debug/DebugOverlay` has caught up: it renders `procs` by `kind`
 * and no longer reads `main.cpu` or `main.heap`. The subscription below is
 * typed by the **generated** `MetricsSnapshot`, so what the backend emits and
 * what the overlay reads are one declaration, and `debugMetrics` validates that
 * shape at runtime before any subscriber sees it.
 *
 * The single assertion left is the one `DebugApi` forces: that interface is
 * v1's frozen preload surface and still names `MainMetricsSnapshot`. Rather
 * than reshape the payload to satisfy it — which would mean fabricating a heap
 * — the function is asserted into the older signature here, and asserted back
 * where the renderer subscribes (`hooks/useDebugInstrumentation.ts`). Both go
 * away with `apps/desktop` at cutover.
 */
type MetricsCallback = (snapshot: MetricsSnapshot) => void;

const onMetrics = (callback: MetricsCallback) =>
  subscribeChannel<MetricsSnapshot>(C.metrics, events.debugMetrics, debugMetrics, callback);

export const debugApi: DebugApi = {
  start: async () => {
    await commands.debugStart();
  },
  stop: async () => {
    await commands.debugStop();
  },
  onMetrics: onMetrics as unknown as DebugApi['onMetrics'],
};
