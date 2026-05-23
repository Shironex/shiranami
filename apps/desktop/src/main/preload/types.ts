/**
 * Preload-side shape of the values flowing across the contextBridge.
 *
 * These mirror the renderer-facing `apps/web/src/types/electron.d.ts`. Shared
 * cross-process shapes (e.g. `TrackMetadata`) are re-exported from
 * `@shiranami/contracts` so the wire type is defined once; the remaining
 * interfaces below are preload-local surface descriptions.
 */

export type { TrackMetadata } from '@shiranami/contracts';

export interface ListeningHistoryEntry {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  duration: number | null;
  playedAt: string;
  playedSeconds: number;
  completionRatio: number;
  completed: boolean;
  source: string;
}

export interface ListeningStatsTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  playCount: number;
  listenedSeconds: number;
  lastPlayedAt: string;
}

export interface ListeningStatsArtist {
  artist: string;
  playCount: number;
  listenedSeconds: number;
}

export interface ListeningStatsSummary {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
  completedPlays: number;
  topTracks: ListeningStatsTrack[];
  topArtists: ListeningStatsArtist[];
}

export interface ListeningActivityPoint {
  date: string;
  playCount: number;
  listenedMinutes: number;
}

export interface ListeningHourlyActivityPoint {
  /** Day of week, SQLite-indexed: 0=Sunday … 6=Saturday (local time). */
  dayOfWeek: number;
  /** Hour of day in local time, 0–23. */
  hour: number;
  playCount: number;
  listenedMinutes: number;
}

export interface ListeningAlbumStat {
  album: string;
  artist: string;
  albumArt: string | null;
  playCount: number;
}

export interface WeeklyInsights {
  /** Gap-based session count for the window (>30 min idle starts a new session). */
  sessionCount: number;
  topAlbums: ListeningAlbumStat[];
}

export interface ToolInstallResult {
  tool: 'ytdlp' | 'ffmpeg';
  success: boolean;
  error?: string;
}

export interface InstallDependenciesResult {
  results: ToolInstallResult[];
}
