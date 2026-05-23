import { ipcMain } from 'electron';
import { IPC_CHANNELS, type RecommendationShelves } from '@shiranami/contracts';
import { getRecommendationShelves, triggerRefresh } from '../recommendation-service';
import { handleWithFallback } from './with-ipc-handler';
import { recommendationsGetArgs, recommendationsRefreshArgs } from './schemas/recommendations';

const C = IPC_CHANNELS.recommendations;

/** Empty shelves returned when even the cache read fails — the renderer renders
 *  a quiet empty state rather than crashing. */
const EMPTY_SHELVES: RecommendationShelves = {
  library: { kind: 'library', items: [], generatedAt: null, stale: true },
  discover: { kind: 'discover', items: [], generatedAt: null, stale: true },
};

export function registerRecommendationsHandlers(): void {
  // Read path: cache-backed, fast. Falls back to empty shelves on any error so
  // the home view never errors out over recommendations.
  handleWithFallback(
    C.get,
    async (): Promise<RecommendationShelves> => getRecommendationShelves(),
    () => EMPTY_SHELVES,
    { schema: recommendationsGetArgs }
  );

  // Refresh path: runs the background job (affinity + yt-dlp RD-mix), coalesced
  // so concurrent triggers share one run. Degrades to the current cache on
  // failure (yt-dlp is best-effort).
  handleWithFallback(
    C.refresh,
    async (): Promise<RecommendationShelves> => triggerRefresh(),
    () => getRecommendationShelves(),
    { schema: recommendationsRefreshArgs }
  );
}

export function cleanupRecommendationsHandlers(): void {
  ipcMain.removeHandler(C.get);
  ipcMain.removeHandler(C.refresh);
}
