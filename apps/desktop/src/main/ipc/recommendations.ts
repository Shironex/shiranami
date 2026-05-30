import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type RecommendationShelves,
  type SimilarTrackResult,
  type SmartMixResult,
  type SmartMixSignals,
} from '@shiranami/contracts';
import {
  computeSimilarTracks,
  computeSmartMixes,
  getRecommendationShelves,
  triggerRefresh,
  markNotInterested,
  undoNotInterested,
} from '../recommendation-service';
import { handle, handleWithFallback } from './with-ipc-handler';
import {
  recommendationsGetArgs,
  recommendationsRefreshArgs,
  recommendationsSimilarArgs,
  recommendationsNotInterestedArgs,
  recommendationsSmartMixesArgs,
} from './schemas/recommendations';

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

  // "More like this" / song-radio: offline content-similarity ranking of
  // existing library tracks against a seed track id. Throws on validation
  // failure; returns an ordered (possibly empty) list otherwise.
  handle(
    C.similar,
    async (_event, seedTrackId: string): Promise<SimilarTrackResult[]> =>
      computeSimilarTracks(seedTrackId),
    { schema: recommendationsSimilarArgs }
  );

  // Negative signal: persist a "Not interested" mark so affinity stops
  // surfacing the track (and softly downranks its artist). Idempotent.
  handle(
    C.notInterested,
    async (_event, trackId: string): Promise<void> => markNotInterested(trackId),
    { schema: recommendationsNotInterestedArgs }
  );

  // Undo a "Not interested" mark.
  handle(
    C.undoNotInterested,
    async (_event, trackId: string): Promise<void> => undoNotInterested(trackId),
    { schema: recommendationsNotInterestedArgs }
  );

  // Smart mixes: offline generation of mood/activity/decade mixes from the
  // renderer's contextual signals + library metadata. Returns a (possibly
  // empty) ordered list.
  handleWithFallback(
    C.smartMixes,
    async (_event, signals: SmartMixSignals): Promise<SmartMixResult[]> =>
      computeSmartMixes(signals),
    () => [],
    { schema: recommendationsSmartMixesArgs }
  );
}

export function cleanupRecommendationsHandlers(): void {
  ipcMain.removeHandler(C.get);
  ipcMain.removeHandler(C.refresh);
  ipcMain.removeHandler(C.similar);
  ipcMain.removeHandler(C.notInterested);
  ipcMain.removeHandler(C.undoNotInterested);
  ipcMain.removeHandler(C.smartMixes);
}
