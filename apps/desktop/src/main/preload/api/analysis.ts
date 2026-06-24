import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type AnalysisAnalyzeInput,
  type AnalysisAnalyzeResult,
  type AnalysisProgress,
} from '@shiranami/contracts';
import { createIpcListener } from '../ipc-listener';

const C = IPC_CHANNELS.analysis;

export interface AnalysisApi {
  /**
   * Estimate tempo (BPM) and musical key for the given tracks via the native
   * analysis addon and persist them on each track row. Tracks already analysed,
   * undecodable, or with a missing file are skipped.
   */
  analyze: (tracks: AnalysisAnalyzeInput[]) => Promise<AnalysisAnalyzeResult>;
  cancel: () => Promise<void>;
  onProgress: (callback: (data: AnalysisProgress) => void) => () => void;
}

export const analysisApi: AnalysisApi = {
  analyze: tracks => invoke(C.analyze, tracks),
  cancel: () => invoke(C.cancel),
  onProgress: createIpcListener<AnalysisProgress>(C.progress),
};
