import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from '@/lib/utils';
import { rowToTrack, type TrackRow } from '@/lib/library';
import type { Track } from '@/stores/usePlayerStore';

/** A play counts once half the track or 30 seconds have played, like the desktop. */
export function countsAsPlay(playedSeconds: number, duration: number): boolean {
  if (playedSeconds >= 30) return true;
  return duration > 0 && playedSeconds / duration >= 0.5;
}

export async function recordPlay(
  db: SQLiteDatabase,
  trackId: string,
  playedSeconds: number,
  duration: number
): Promise<void> {
  const ratio = duration > 0 ? Math.min(1, playedSeconds / duration) : 0;
  await db.runAsync(
    `INSERT INTO play_history (id, track_id, played_seconds, completion_ratio, completed, source)
     VALUES (?, ?, ?, ?, ?, 'library')`,
    [randomUUID(), trackId, playedSeconds, ratio, ratio >= 0.9 ? 1 : 0]
  );
}

export interface HistoryEntry {
  /** Unique per play; the same track can appear more than once. */
  key: string;
  track: Track;
  playedAt: string;
}

export async function loadHistory(db: SQLiteDatabase, limit = 100): Promise<HistoryEntry[]> {
  const rows = await db.getAllAsync<TrackRow & { ph_id: string; ph_played_at: string }>(
    `SELECT t.*, ph.id AS ph_id, ph.played_at AS ph_played_at
     FROM play_history ph JOIN tracks t ON t.id = ph.track_id
     ORDER BY ph.played_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(row => ({ key: row.ph_id, track: rowToTrack(row), playedAt: row.ph_played_at }));
}
