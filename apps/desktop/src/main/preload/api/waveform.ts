import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type WaveformPeaksResult } from '@shiranami/contracts';

const C = IPC_CHANNELS.waveform;

export interface WaveformApi {
  /**
   * Fetch (and cache) waveform peaks for a local audio file. Resolves null for
   * radio streams, missing files, or formats the native decoder can't read —
   * the seekbar falls back to a flat bar in those cases.
   */
  getPeaks: (filePath: string) => Promise<WaveformPeaksResult | null>;
}

export const waveformApi: WaveformApi = {
  getPeaks: filePath => invoke(C.getPeaks, filePath),
};
