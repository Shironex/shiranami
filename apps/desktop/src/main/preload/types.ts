/**
 * Preload-side shape of the values flowing across the contextBridge.
 *
 * These mirror the renderer-facing `apps/web/src/types/electron.d.ts`. Every
 * cross-process shape is defined once in `@shiranami/contracts` and re-exported
 * here for the `api/*` modules, so the preload carries no local wire types.
 */

export type { TrackMetadata } from '@shiranami/contracts';

// Listening-history wire types live in @shiranami/contracts so the preload and
// renderer surfaces share one definition. Re-exported for the api/* modules.
export type {
  ListeningHistoryEntry,
  ListeningStatsTrack,
  ListeningStatsArtist,
  ListeningStatsSummary,
  ListeningActivityPoint,
  ListeningHourlyActivityPoint,
  ListeningAlbumStat,
  WeeklyInsights,
} from '@shiranami/contracts';
