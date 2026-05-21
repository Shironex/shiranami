import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, type MainMetricsSnapshot } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.debug;

export interface DebugApi {
  /** Begin main-process metrics sampling (~1 Hz). Idempotent. */
  start: () => Promise<void>;
  /** Stop sampling and clear the interval. Idempotent. */
  stop: () => Promise<void>;
  /** Subscribe to main-process metric snapshots. Returns an unsubscribe fn. */
  onMetrics: (callback: (snapshot: MainMetricsSnapshot) => void) => () => void;
}

export const debugApi: DebugApi = {
  start: () => ipcRenderer.invoke(C.start),
  stop: () => ipcRenderer.invoke(C.stop),
  onMetrics: createIpcListener<MainMetricsSnapshot>(C.metrics),
};
