import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * True when `uri` is a file inside the app's own tracks folder. Anything else
 * (picked in place, on shared storage, a stream) is never ours to delete.
 */
export function isAppOwnedPath(uri: string, tracksDirUri: string): boolean {
  const dir = tracksDirUri.endsWith('/') ? tracksDirUri : `${tracksDirUri}/`;
  if (!uri.startsWith(dir) || uri.length === dir.length) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri.slice(dir.length));
  } catch {
    return false;
  }
  return !decoded.split(/[\\/]/).some(part => part === '..' || part === '');
}

/** Rows that point at a track and go with it. */
const TRACK_REFERENCES = ['playlist_tracks', 'play_history', 'youtube_mappings'] as const;

/** Deletes the tracks and everything that references them, all or nothing. */
export async function deleteTracksFromDb(db: SQLiteDatabase, trackIds: string[]): Promise<void> {
  if (trackIds.length === 0) return;
  const marks = trackIds.map(() => '?').join(', ');
  await db.withTransactionAsync(async () => {
    for (const table of TRACK_REFERENCES) {
      await db.runAsync(`DELETE FROM ${table} WHERE track_id IN (${marks})`, trackIds);
    }
    await db.runAsync(`DELETE FROM tracks WHERE id IN (${marks})`, trackIds);
  });
}

export interface FileDeleter {
  tracksDirUri: string;
  deleteFile: (uri: string) => void;
}

/**
 * Removes the copied audio of imported tracks. Files outside the tracks folder
 * are skipped, and one failure never stops the rest. Returns the deleted uris.
 */
export function deleteOwnedFiles(filePaths: string[], files: FileDeleter): string[] {
  const deleted: string[] = [];
  for (const uri of filePaths) {
    if (!isAppOwnedPath(uri, files.tracksDirUri)) continue;
    try {
      files.deleteFile(uri);
      deleted.push(uri);
    } catch {
      // Already gone or locked: the row is removed either way.
    }
  }
  return deleted;
}
