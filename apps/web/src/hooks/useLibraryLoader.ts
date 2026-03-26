import { useEffect } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import { mapDbTracksToTracks } from '@/lib/trackMapper';

/**
 * Loads the persisted music library from the SQLite database on app startup.
 * Must be mounted once at the app root level.
 * In non-Electron environments this is a no-op.
 */
export function useLibraryLoader() {
  useEffect(() => {
    if (!IS_ELECTRON) return;

    // Use store state as guard instead of a ref (refs survive HMR but store may reset)
    if (usePlayerStore.getState().library.length > 0) return;

    async function loadLibrary() {
      try {
        const dbTracks = await window.electronAPI.db.tracks.getAll();
        if (!dbTracks || dbTracks.length === 0) return;

        const tracks = mapDbTracksToTracks(dbTracks as Record<string, unknown>[]);

        // Only populate if still empty (guards against race conditions)
        const current = usePlayerStore.getState();
        if (current.library.length === 0) {
          usePlayerStore.setState({ library: tracks });
        }
        if (current.queue.length === 0) {
          usePlayerStore.setState({ queue: tracks });
        }
      } catch (err) {
        console.error('Failed to load library from database:', err);
      }
    }

    loadLibrary();
  }, []);
}
