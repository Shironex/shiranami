import { useCallback, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { loadLibrary } from '@/lib/library';
import type { SearchResult } from '@/lib/types';
import { youtubeSaveDeps } from '@/lib/youtube-files';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useYouTubeSaveStore } from '@/stores/useYouTubeSaveStore';

/** Save to phone for search results: start, cancel, and which videos are saved. */
export function useYouTubeSave() {
  const db = useSQLiteContext();
  const jobs = useYouTubeSaveStore(s => s.jobs);
  const library = usePlayerStore(s => s.library);
  const setLibrary = usePlayerStore(s => s.setLibrary);

  /** Video ids already in the library. */
  const savedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const track of library) {
      if (track.id.startsWith('yt-')) ids.add(track.id.slice(3));
    }
    return ids;
  }, [library]);

  const save = useCallback(
    (result: SearchResult) =>
      useYouTubeSaveStore
        .getState()
        .save(youtubeSaveDeps(db), result, async () => setLibrary(await loadLibrary(db))),
    [db, setLibrary]
  );

  const cancel = useCallback(
    (videoId: string) => useYouTubeSaveStore.getState().cancel(videoId),
    []
  );

  return { jobs, savedIds, save, cancel };
}
