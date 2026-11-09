import type { SQLiteDatabase } from 'expo-sqlite';
import type { Track } from '@/stores/usePlayerStore';

/** A `tracks` row as SQLite returns it. */
export interface TrackRow {
  id: string;
  file_path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  album_art: string | null;
  is_favorite: number;
  play_count: number | null;
  created_at: string;
  year?: number | null;
  track_number?: number | null;
}

export function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    filePath: row.file_path,
    title: row.title,
    artist: row.artist ?? 'Unknown Artist',
    album: row.album ?? 'Unknown Album',
    duration: row.duration ?? 0,
    albumArt: row.album_art ?? undefined,
    isFavorite: !!row.is_favorite,
    playCount: row.play_count ?? 0,
    addedAt: row.created_at,
    year: row.year ?? undefined,
    trackNumber: row.track_number ?? undefined,
  };
}

/** Every track whose file is still there, newest first. */
export async function loadLibrary(db: SQLiteDatabase): Promise<Track[]> {
  const rows = await db.getAllAsync<TrackRow>(
    'SELECT * FROM tracks WHERE missing = 0 ORDER BY created_at DESC'
  );
  return rows.map(rowToTrack);
}

export async function toggleFavoriteInDb(db: SQLiteDatabase, trackId: string): Promise<void> {
  await db.runAsync(
    "UPDATE tracks SET is_favorite = NOT is_favorite, updated_at = datetime('now') WHERE id = ?",
    [trackId]
  );
}
