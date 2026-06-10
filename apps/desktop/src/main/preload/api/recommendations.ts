import { invoke } from '../context-bridge';
import {
  IPC_CHANNELS,
  type RecommendationShelves,
  type SimilarTrackResult,
  type SmartMixResult,
  type SmartMixSignals,
} from '@shiranami/contracts';

const C = IPC_CHANNELS.recommendations;

export interface RecommendationsApi {
  /** Read both shelves from the cache (fast; library recomputes inline if stale). */
  get: () => Promise<RecommendationShelves>;
  /** Run the background refresh (affinity + yt-dlp RD-mix) and return fresh shelves. */
  refresh: () => Promise<RecommendationShelves>;
  /** "More like this": rank library tracks by content similarity to a seed. */
  similar: (seedTrackId: string) => Promise<SimilarTrackResult[]>;
  /** Mark a track "Not interested" so the affinity engine stops surfacing it. */
  notInterested: (trackId: string) => Promise<void>;
  /** Undo a previous "Not interested" mark for a track. */
  undoNotInterested: (trackId: string) => Promise<void>;
  /**
   * Generate mood/activity/decade mixes from contextual signals + metadata.
   * Resolves to `null` when generation fails (distinct from `[]` = no mixes
   * apply) so the renderer can show an honest error rather than the
   * empty-library state.
   */
  smartMixes: (signals: SmartMixSignals) => Promise<SmartMixResult[] | null>;
}

export const recommendationsApi: RecommendationsApi = {
  get: () => invoke(C.get),
  refresh: () => invoke(C.refresh),
  similar: (seedTrackId: string) => invoke(C.similar, seedTrackId),
  notInterested: (trackId: string) => invoke(C.notInterested, trackId),
  undoNotInterested: (trackId: string) => invoke(C.undoNotInterested, trackId),
  smartMixes: (signals: SmartMixSignals) => invoke(C.smartMixes, signals),
};
