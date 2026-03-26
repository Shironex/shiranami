import { useMemo } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { usePlaylistQuery, usePlaylistTracksQuery } from '@/hooks/queries/usePlaylists';

/**
 * Fetches and manages a playlist's data (metadata + tracks) using TanStack Query.
 * Syncs isFavorite state from the library store in real-time.
 */
export function usePlaylistDetail(playlistId: string | null) {
  const library = usePlayerStore((s) => s.library);

  const {
    data: playlist,
    isLoading: isLoadingPlaylist,
  } = usePlaylistQuery(playlistId);

  const {
    data: tracks = [],
    isLoading: isLoadingTracks,
  } = usePlaylistTracksQuery(playlistId);

  const isLoading = isLoadingPlaylist || isLoadingTracks;

  // Sync isFavorite from the store so hearts update in real-time
  const displayTracks = useMemo(() => {
    const favMap = new Map(library.map((t) => [t.id, t.isFavorite]));
    return tracks.map((t) => {
      const fav = favMap.get(t.id);
      return fav !== undefined && fav !== t.isFavorite ? { ...t, isFavorite: fav } : t;
    });
  }, [tracks, library]);

  return { playlist: playlist ?? null, tracks, displayTracks, isLoading };
}
