/**
 * Preload-side shape of the values flowing across the contextBridge.
 *
 * These mirror the renderer-facing `apps/web/src/types/electron.d.ts`. Shared
 * cross-process shapes (e.g. `TrackMetadata`) are re-exported from
 * `@shiranami/contracts` so the wire type is defined once; the remaining
 * interfaces below are preload-local surface descriptions.
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

export interface ToolInstallResult {
  tool: 'ytdlp' | 'ffmpeg';
  success: boolean;
  error?: string;
}

export interface InstallDependenciesResult {
  results: ToolInstallResult[];
}
