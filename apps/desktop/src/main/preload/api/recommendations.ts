import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, type RecommendationShelves } from '@shiranami/contracts';

const C = IPC_CHANNELS.recommendations;

export interface RecommendationsApi {
  /** Read both shelves from the cache (fast; library recomputes inline if stale). */
  get: () => Promise<RecommendationShelves>;
  /** Run the background refresh (affinity + yt-dlp RD-mix) and return fresh shelves. */
  refresh: () => Promise<RecommendationShelves>;
}

export const recommendationsApi: RecommendationsApi = {
  get: () => ipcRenderer.invoke(C.get),
  refresh: () => ipcRenderer.invoke(C.refresh),
};
