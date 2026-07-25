import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type LoudnessApi, type LoudnessProgress } from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.loudness;

export type { LoudnessApi };

export const loudnessApi: LoudnessApi = {
  analyze: tracks => invoke(C.analyze, tracks),
  cancel: () => invoke(C.cancel),
  onProgress: createIpcListener<LoudnessProgress>(C.progress),
};
