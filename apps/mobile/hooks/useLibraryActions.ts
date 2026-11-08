import { useCallback, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import { libraryDeps } from '@/lib/library-files';
import { importPicked, type ImportResult } from '@/lib/library-scan';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useDocumentPicker } from './useDocumentPicker';

/** Manual import: pick files, skip the ones already in the library, copy the rest. */
export function useLibraryActions() {
  const db = useSQLiteContext();
  const { pickFiles, picking } = useDocumentPicker();
  const [reading, setReading] = useState(false);
  const setLibrary = usePlayerStore(s => s.setLibrary);

  const importFiles = useCallback(async (): Promise<ImportResult> => {
    const files = await pickFiles();
    if (files.length === 0) return { added: 0, skipped: 0 };
    setReading(true);
    try {
      const result = await importPicked(db, libraryDeps(), files);
      setLibrary(await loadLibrary(db));
      return result;
    } finally {
      setReading(false);
    }
  }, [db, pickFiles, setLibrary]);

  return { importFiles, importing: picking || reading };
}
