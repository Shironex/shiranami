import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from '@/lib/utils';

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  updatedAt: string;
}

/** Every playlist with its track ids in order, most recently changed first. */
export async function loadPlaylists(db: SQLiteDatabase): Promise<Playlist[]> {
  const playlists = await db.getAllAsync<{ id: string; name: string; updated_at: string }>(
    'SELECT id, name, updated_at FROM playlists ORDER BY updated_at DESC'
  );
  const links = await db.getAllAsync<{ playlist_id: string; track_id: string }>(
    'SELECT playlist_id, track_id FROM playlist_tracks ORDER BY position ASC'
  );
  const byPlaylist = new Map<string, string[]>();
  for (const link of links) {
    const ids = byPlaylist.get(link.playlist_id) ?? [];
    ids.push(link.track_id);
    byPlaylist.set(link.playlist_id, ids);
  }
  return playlists.map(p => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updated_at,
    trackIds: byPlaylist.get(p.id) ?? [],
  }));
}

export async function createPlaylist(db: SQLiteDatabase, name: string): Promise<string> {
  const id = randomUUID();
  await db.runAsync('INSERT INTO playlists (id, name) VALUES (?, ?)', [id, name]);
  return id;
}

export async function renamePlaylist(db: SQLiteDatabase, id: string, name: string) {
  await db.runAsync("UPDATE playlists SET name = ?, updated_at = datetime('now') WHERE id = ?", [
    name,
    id,
  ]);
}

export async function deletePlaylist(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
}

/** Appends a track; adding one that is already there does nothing. */
export async function addToPlaylist(db: SQLiteDatabase, playlistId: string, trackId: string) {
  await db.withTransactionAsync(async () => {
    const max = await db.getFirstAsync<{ max_pos: number | null }>(
      'SELECT MAX(position) AS max_pos FROM playlist_tracks WHERE playlist_id = ?',
      [playlistId]
    );
    await db.runAsync(
      'INSERT OR IGNORE INTO playlist_tracks (id, playlist_id, track_id, position) VALUES (?, ?, ?, ?)',
      [randomUUID(), playlistId, trackId, (max?.max_pos ?? -1) + 1]
    );
    await db.runAsync("UPDATE playlists SET updated_at = datetime('now') WHERE id = ?", [
      playlistId,
    ]);
  });
}

export async function removeFromPlaylist(db: SQLiteDatabase, playlistId: string, trackId: string) {
  await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [
    playlistId,
    trackId,
  ]);
  await db.runAsync("UPDATE playlists SET updated_at = datetime('now') WHERE id = ?", [playlistId]);
}

/** Trims and caps a typed name; empty means "do not save". */
export function cleanPlaylistName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 60);
}
