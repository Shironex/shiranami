import { UNKNOWN_ALBUM, UNKNOWN_ARTIST } from '@/lib/track-meta';
import type { Track } from '@/stores/usePlayerStore';

export interface Album {
  /** Stable id from the album and artist names, for list keys. */
  key: string;
  title: string;
  artist: string;
  /** In album order: track number first, then title. */
  tracks: Track[];
  art?: string;
  year?: number;
}

/**
 * An album name as albums are grouped and looked up: tags often carry stray
 * spaces, so every side (grouping, links, lookup) compares this form.
 */
export function normalizeAlbumTitle(title: string | null | undefined): string {
  return title?.trim() ?? '';
}

/** True when the track names a real album (not the scan's fallback). */
export function hasAlbum(track: Track): boolean {
  const album = normalizeAlbumTitle(track.album);
  return !!album && album !== UNKNOWN_ALBUM;
}

function albumOrder(a: Track, b: Track): number {
  const an = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const bn = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
  return an !== bn ? an - bn : a.title.localeCompare(b.title);
}

function albumKey(title: string, artist: string): string {
  return `${artist}\u0000${title}`;
}

/** Tracks grouped into albums by album name and artist, sorted by title. */
export function groupAlbums(tracks: Track[]): Album[] {
  const byKey = new Map<string, Album>();
  for (const track of tracks) {
    if (!hasAlbum(track)) continue;
    const title = normalizeAlbumTitle(track.album);
    const artist = track.artist || UNKNOWN_ARTIST;
    const key = albumKey(title, artist);
    const album = byKey.get(key) ?? { key, title, artist, tracks: [] };
    album.tracks.push(track);
    album.art ??= track.albumArt;
    album.year ??= track.year ?? undefined;
    byKey.set(key, album);
  }
  return [...byKey.values()]
    .map(album => ({ ...album, tracks: [...album.tracks].sort(albumOrder) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** One album by its names, or null when no track belongs to it any more. */
export function findAlbum(tracks: Track[], title: string, artist: string): Album | null {
  const wanted = normalizeAlbumTitle(title);
  return groupAlbums(tracks.filter(t => t.artist === artist)).find(a => a.title === wanted) ?? null;
}

/** "2019 · 8 songs, 19 min"; the year only when the tags have one. */
export function albumMeta(album: Pick<Album, 'tracks' | 'year'>): string {
  const count = album.tracks.length === 1 ? '1 song' : `${album.tracks.length} songs`;
  const minutes = Math.round(album.tracks.reduce((sum, t) => sum + (t.duration || 0), 0) / 60);
  const size = minutes > 0 ? `${count}, ${minutes} min` : count;
  return album.year ? `${album.year} · ${size}` : size;
}
