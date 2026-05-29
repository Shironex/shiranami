import { ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type RecommendationShelves,
  type SimilarTrackResult,
} from '@shiranami/contracts';

const C = IPC_CHANNELS.recommendations;

export interface RecommendationsApi {
  /** Read both shelves from the cache (fast; library recomputes inline if stale). */
  get: () => Promise<RecommendationShelves>;
  /** Run the background refresh (affinity + yt-dlp RD-mix) and return fresh shelves. */
  refresh: () => Promise<RecommendationShelves>;
  /** "More like this": rank library tracks by content similarity to a seed. */
  similar: (seedTrackId: string) => Promise<SimilarTrackResult[]>;
}

export const recommendationsApi: RecommendationsApi = {
  get: () => ipcRenderer.invoke(C.get),
  refresh: () => ipcRenderer.invoke(C.refresh),
  similar: (seedTrackId: string) => ipcRenderer.invoke(C.similar, seedTrackId),
};
