import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useTracks } from '@/lib/db-queries';
import { useDocumentPicker } from './useDocumentPicker';

function parseTrackName(filename: string): { title: string; artist: string } {
  // Remove extension
  const name = filename.replace(/\.[^.]+$/, '');

  // Try "Artist - Title" format
  const dashSplit = name.split(' - ');
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim(),
      title: dashSplit.slice(1).join(' - ').trim(),
    };
  }

  return { title: name.trim(), artist: 'Unknown Artist' };
}

export function useLibraryActions() {
  const db = useSQLiteContext();
  const { pickFiles, importing } = useDocumentPicker();
  const { refresh } = useTracks();
  const setLibrary = usePlayerStore(s => s.setLibrary);

  const importFiles = useCallback(async () => {
    const files = await pickFiles();
    if (files.length === 0) return 0;

    for (const file of files) {
      const { title, artist } = parseTrackName(file.name);

      await db.runAsync(
        `INSERT OR IGNORE INTO tracks (id, file_path, title, artist, album, duration)
         VALUES (?, ?, ?, ?, 'Unknown Album', NULL)`,
        [file.id, file.uri, title, artist]
      );
    }

    // Refresh the tracks list and sync to store
    await refresh();
    const rows = await db.getAllAsync<{
      id: string;
      file_path: string;
      title: string;
      artist: string;
      album: string;
      duration: number | null;
      album_art: string | null;
      is_favorite: number;
      play_count: number;
    }>('SELECT * FROM tracks ORDER BY created_at DESC');

    setLibrary(
      rows.map(r => ({
        id: r.id,
        filePath: r.file_path,
        title: r.title,
        artist: r.artist ?? 'Unknown Artist',
        album: r.album ?? 'Unknown Album',
        duration: r.duration ?? 0,
        albumArt: r.album_art ?? undefined,
        isFavorite: !!r.is_favorite,
        playCount: r.play_count ?? 0,
      }))
    );

    return files.length;
  }, [db, pickFiles, refresh, setLibrary]);

  return { importFiles, importing };
}
