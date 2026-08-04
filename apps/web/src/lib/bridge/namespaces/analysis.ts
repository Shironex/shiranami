import { IPC_CHANNELS, type AnalysisApi, type AnalysisProgress } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { analysisProgress } from '../narrowers';

const C = IPC_CHANNELS.analysis;

export const analysisApi: AnalysisApi = {
  analyze: tracks => commands.analysisAnalyze(tracks),
  cancel: async () => {
    await commands.analysisCancel();
  },
  onProgress: callback =>
    subscribeChannel<AnalysisProgress>(
      C.progress,
      events.analysisProgress,
      analysisProgress,
      callback
    ),
};
