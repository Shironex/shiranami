import { IPC_CHANNELS, type LoudnessApi, type LoudnessProgress } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { loudnessProgress } from '../narrowers';

const C = IPC_CHANNELS.loudness;

export const loudnessApi: LoudnessApi = {
  analyze: tracks => commands.loudnessAnalyze(tracks),
  cancel: async () => {
    await commands.loudnessCancel();
  },
  onProgress: callback =>
    subscribeChannel<LoudnessProgress>(
      C.progress,
      events.loudnessProgress,
      loudnessProgress,
      callback
    ),
};
