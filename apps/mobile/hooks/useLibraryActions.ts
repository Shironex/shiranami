import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useDocumentPicker } from './useDocumentPicker';

function parseTrackName(filename: string): { title: string; artist: string } {
  const name = filename.replace(/\.[^.]+$/, '');
  // "Artist - Title"
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

    setLibrary(await loadLibrary(db));
    return files.length;
  }, [db, pickFiles, setLibrary]);

  return { importFiles, importing };
}
