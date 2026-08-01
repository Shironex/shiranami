import type { WaveformApi } from '@shiranami/contracts';
import { commands } from '../commands';

export const waveformApi: WaveformApi = {
  getPeaks: filePath => commands.waveformGetPeaks(filePath),
};
