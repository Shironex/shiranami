/**
 * Preload-side shape of the values flowing across the contextBridge.
 *
 * These mirror the renderer-facing `apps/web/src/types/electron.d.ts` and the
 * domain types in `@shiranami/contracts`. They live here (and not in contracts)
 * because the preload `ElectronAPI` is currently the source of truth for the
 * renderer surface; migrating individual interfaces into contracts is staged
 * follow-up work.
 */

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  albumArt: string | null;
}

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
