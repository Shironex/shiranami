/**
 * Listening-history wire types: the shapes the `db:history:*` IPC handlers
 * return across the contextBridge.
 *
 * Single source of truth for both sides of the bridge — the preload surface
 * (`apps/desktop/src/main/preload/types.ts`) and the renderer contract
 * (`apps/web/src/types/electron.d.ts`) re-export these rather than redeclaring
 * them, so the two cannot silently diverge.
 *
 * Nullability note: artist/album are nullable in the `tracks` schema but the
 * history handlers collapse nulls to "Unknown Artist"/"Unknown Album" at the
 * IPC boundary, so these declare them non-null and the renderer renders them
 * directly.
 */

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
