import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type DebugApi, type MainMetricsSnapshot } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.debug;

export type { DebugApi };

export const debugApi: DebugApi = {
  start: () => invoke(C.start),
  stop: () => invoke(C.stop),
  onMetrics: createIpcListener<MainMetricsSnapshot>(C.metrics),
};
