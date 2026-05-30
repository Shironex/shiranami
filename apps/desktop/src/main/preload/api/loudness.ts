import { ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type LoudnessAnalyzeInput,
  type LoudnessAnalyzeResult,
  type LoudnessProgress,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.loudness;

export interface LoudnessApi {
  /**
   * Measure integrated loudness (LUFS) for the given tracks via ffmpeg
   * loudnorm and persist it on each track row. Tracks already analysed, with
   * non-finite loudness, or with a missing file are skipped.
   */
  analyze: (tracks: LoudnessAnalyzeInput[]) => Promise<LoudnessAnalyzeResult>;
  cancel: () => Promise<void>;
  onProgress: (callback: (data: LoudnessProgress) => void) => () => void;
}

export const loudnessApi: LoudnessApi = {
  analyze: tracks => ipcRenderer.invoke(C.analyze, tracks),
  cancel: () => ipcRenderer.invoke(C.cancel),
  onProgress: createIpcListener<LoudnessProgress>(C.progress),
};
