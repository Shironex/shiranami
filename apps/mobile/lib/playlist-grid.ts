import type { Track } from '@/stores/usePlayerStore';

/**
 * Covers for a playlist tile: four distinct covers make a 2 by 2 mosaic,
 * fewer fall back to the first cover alone, none to the kanji tile.
 */
export function mosaicCovers(tracks: Track[]): string[] {
  const covers: string[] = [];
  for (const track of tracks) {
    if (track.albumArt && !covers.includes(track.albumArt)) covers.push(track.albumArt);
    if (covers.length === 4) return covers;
  }
  return covers.slice(0, 1);
}

export type PlaylistCell<T> =
  | { type: 'favorites'; key: string }
  | { type: 'playlist'; key: string; entry: T }
  | { type: 'new'; key: string };

/**
 * The playlist grid, two to a row: Favorites first, then the playlists, then
 * New playlist last so the plus is where the eye ends.
 */
export function playlistRows<T extends { playlist: { id: string } }>(
  entries: T[]
): PlaylistCell<T>[][] {
  const cells: PlaylistCell<T>[] = [
    { type: 'favorites', key: 'favorites' },
    ...entries.map(entry => ({ type: 'playlist' as const, key: entry.playlist.id, entry })),
    { type: 'new', key: 'new' },
  ];
  const rows: PlaylistCell<T>[][] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return rows;
}
