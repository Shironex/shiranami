import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type RecommendationsApi, type SmartMixSignals } from '@shiranami/contracts';

const C = IPC_CHANNELS.recommendations;

export type { RecommendationsApi };

export const recommendationsApi: RecommendationsApi = {
  get: () => invoke(C.get),
  refresh: () => invoke(C.refresh),
  similar: (seedTrackId: string) => invoke(C.similar, seedTrackId),
  notInterested: (trackId: string) => invoke(C.notInterested, trackId),
  undoNotInterested: (trackId: string) => invoke(C.undoNotInterested, trackId),
  smartMixes: (signals: SmartMixSignals) => invoke(C.smartMixes, signals),
};
