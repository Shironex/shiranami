import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type WaveformApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.waveform;

export type { WaveformApi };

export const waveformApi: WaveformApi = {
  getPeaks: filePath => invoke(C.getPeaks, filePath),
};
