import { useEffect } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import i18n from '@/lib/i18n';

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

        const tracks: Track[] = (dbTracks as Record<string, unknown>[]).map(t => ({
          id: t.id as string,
          title: t.title as string,
          artist: (t.artist as string) ?? i18n.t('unknownArtist', { ns: 'common' }),
          album: (t.album as string) ?? i18n.t('unknownAlbum', { ns: 'common' }),
          duration: (t.duration as number) ?? 0,
          filePath: t.filePath as string,
          albumArt: (t.albumArt as string | null) ?? undefined,
          genre: t.genre as string | null | undefined,
          year: t.year as number | null | undefined,
          trackNumber: t.trackNumber as number | null | undefined,
          isFavorite: (t.isFavorite as boolean) ?? false,
          playCount: (t.playCount as number) ?? 0,
          createdAt: t.createdAt as string | undefined,
          updatedAt: t.updatedAt as string | undefined,
        }));

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
