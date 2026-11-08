import { useMemo } from 'react';
import { countLabel } from '@/lib/format';
import type { Playlist } from '@/lib/playlists';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { usePlaylistStore } from '@/stores/usePlaylistStore';

/** "12 songs · 41 min". */
export function playlistMeta(tracks: Track[]): string {
  const count = countLabel(tracks.length, 'song', 'songs');
  const minutes = Math.round(tracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60);
  return minutes > 0 ? `${count} · ${minutes} min` : count;
}

function useTracksById(): Map<string, Track> {
  const library = usePlayerStore(s => s.library);
  return useMemo(() => new Map(library.map(t => [t.id, t])), [library]);
}

/** Tracks of a playlist that are still in the library, in playlist order. */
function resolve(playlist: Playlist, byId: Map<string, Track>): Track[] {
  return playlist.trackIds.map(id => byId.get(id)).filter((t): t is Track => !!t);
}

/** Every playlist with its resolved tracks. */
export function usePlaylists() {
  const playlists = usePlaylistStore(s => s.playlists);
  const byId = useTracksById();
  return useMemo(
    () => playlists.map(playlist => ({ playlist, tracks: resolve(playlist, byId) })),
    [playlists, byId]
  );
}

/** One playlist with its tracks, or null once it is gone. */
export function usePlaylist(id: string) {
  const playlist = usePlaylistStore(s => s.playlists.find(p => p.id === id) ?? null);
  const byId = useTracksById();
  const tracks = useMemo(() => (playlist ? resolve(playlist, byId) : []), [playlist, byId]);
  return { playlist, tracks };
}
