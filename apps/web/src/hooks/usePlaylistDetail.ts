import { useState, useEffect, useCallback, useMemo } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/types/electron';

/**
 * Fetches and manages a playlist's data (metadata + tracks).
 * Syncs isFavorite state from the library store in real-time.
 */
export function usePlaylistDetail(playlistId: string | null) {
  const { t: tToast } = useTranslation('toast');
  const library = usePlayerStore((s) => s.library);

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPlaylist = useCallback(async () => {
    if (!IS_ELECTRON || !playlistId) return;
    setIsLoading(true);
    try {
      const [pl, tr] = await Promise.all([
        window.electronAPI.db.playlists.get(playlistId) as Promise<Playlist>,
        window.electronAPI.db.playlists.getTracks(playlistId) as Promise<Track[]>,
      ]);
      setPlaylist(pl);
      setTracks(tr);
    } catch {
      toast.error(tToast('failedLoadPlaylist'));
    } finally {
      setIsLoading(false);
    }
  }, [playlistId, tToast]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  // Sync isFavorite from the store so hearts update in real-time
  const displayTracks = useMemo(() => {
    const favMap = new Map(library.map((t) => [t.id, t.isFavorite]));
    return tracks.map((t) => {
      const fav = favMap.get(t.id);
      return fav !== undefined && fav !== t.isFavorite ? { ...t, isFavorite: fav } : t;
    });
  }, [tracks, library]);

  return { playlist, setPlaylist, tracks, setTracks, displayTracks, isLoading };
}
