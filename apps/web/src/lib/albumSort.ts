import { type Track } from '@/stores/types';
import { type AlbumSortMode, type AlbumSortOrder } from '@/stores/useUIStore';

export interface AlbumData {
  /**
   * Stable composite identity for this album: `albumArtist \u0000 album`. Two
   * albums with the same title but different album artists stay separate.
   * Untagged albums have no album-artist tag and are keyed on the title alone,
   * so an untagged various-artists compilation stays one album (#269). Use this
   * (not `name`) to select/filter an album.
   */
  key: string;
  name: string;
  /** Album artist for display — the tag if present, else a representative track artist. */
  albumArtist: string;
  artist: string;
  year: number | null;
  createdAt: string | null;
  albumArt?: string;
  trackCount: number;
  tracks: Track[];
}

/**
 * The album-artist used for *display*: the album-artist tag if present, else
 * the track artist as a representative fallback. NOT used for grouping — see
 * `albumKeyOf`, which deliberately does not fall back to the track artist.
 */
export function albumArtistOf(track: Track): string {
  return track.albumArtist?.trim() || track.artist;
}

/**
 * Composite album identity used as the grouping/selection key.
 *
 * Keyed on the album-artist tag when present, so identically-titled albums by
 * different artists stay separate. Without an album-artist tag we key on the
 * album title alone — keying on the track artist (as 0.22.0 did) fragments an
 * untagged various-artists compilation into one album per track artist (#269).
 * The NUL separator can't appear in a tag string, so the two key shapes can't
 * collide.
 */
export function albumKeyOf(track: Track): string {
  const albumArtist = track.albumArtist?.trim();
  return albumArtist ? `${albumArtist}\u0000${track.album}` : `\u0000${track.album}`;
}

/**
 * Group a flat list of tracks into album buckets.
 *
 * Albums are keyed by `albumKeyOf` (album-artist tag when present, else the
 * album title alone) — not by the track artist — so identically-named albums by
 * different artists do not merge while an untagged compilation's varied track
 * artists do not fragment one album (#269). Each album's displayed `artist` is
 * still derived from the distinct track artists (e.g. "Artist A, Artist B" for
 * compilations). The album's year is taken from the first track encountered for
 * that album.
 */
export function groupTracksByAlbum(
  tracks: Track[],
  sortMode: AlbumSortMode = 'name',
  sortOrder: AlbumSortOrder = 'asc'
): AlbumData[] {
  const map = new Map<string, AlbumData>();
  const artistSets = new Map<string, Set<string>>();

  for (const track of tracks) {
    const key = albumKeyOf(track);
    const existing = map.get(key);
    if (existing) {
      existing.trackCount++;
      existing.tracks.push(track);
      if (!existing.albumArt && track.albumArt) {
        existing.albumArt = track.albumArt;
      }
      if (existing.year == null && track.year != null) {
        existing.year = track.year;
      }
      const trackCreatedAt = track.createdAt ?? null;
      if (trackCreatedAt !== null) {
        // Use the latest track timestamp so adding a new track to an existing
        // album bubbles it up in "Recently Added".
        if (existing.createdAt === null || trackCreatedAt > existing.createdAt) {
          existing.createdAt = trackCreatedAt;
        }
      }
      const artists = artistSets.get(key)!;
      artists.add(track.artist);
      existing.artist = Array.from(artists).join(', ');
    } else {
      artistSets.set(key, new Set([track.artist]));
      map.set(key, {
        key,
        name: track.album,
        albumArtist: albumArtistOf(track),
        artist: track.artist,
        year: track.year ?? null,
        createdAt: track.createdAt ?? null,
        albumArt: track.albumArt,
        trackCount: 1,
        tracks: [track],
      });
    }
  }

  const groups = Array.from(map.values());
  const direction = sortOrder === 'desc' ? -1 : 1;

  groups.sort((a, b) => {
    switch (sortMode) {
      case 'artist': {
        // Primary: artist (respects sort direction)
        const primary = a.artist.localeCompare(b.artist) * direction;
        if (primary !== 0) return primary;
        // Secondary: year (ascending, nulls last)
        const yearA = a.year ?? Number.POSITIVE_INFINITY;
        const yearB = b.year ?? Number.POSITIVE_INFINITY;
        if (yearA !== yearB) return yearA - yearB;
        // Tertiary: album name (ascending)
        return a.name.localeCompare(b.name);
      }
      case 'year': {
        // Primary: year (respects sort direction, nulls treated as +Infinity)
        const yearA = a.year ?? Number.POSITIVE_INFINITY;
        const yearB = b.year ?? Number.POSITIVE_INFINITY;
        const primary = (yearA - yearB) * direction;
        if (primary !== 0) return primary;
        // Secondary: album name (ascending)
        return a.name.localeCompare(b.name);
      }
      case 'recentlyAdded': {
        // SQLite `datetime('now')` is 'YYYY-MM-DD HH:MM:SS' — string compare avoids Date.parse NaN on Safari.
        const ta = a.createdAt ?? '';
        const tb = b.createdAt ?? '';
        const primary = (ta < tb ? 1 : ta > tb ? -1 : 0) * direction;
        if (primary !== 0) return primary;
        return a.name.localeCompare(b.name);
      }
      case 'name':
      default:
        return a.name.localeCompare(b.name) * direction;
    }
  });

  return groups;
}

/**
 * Sort tracks of a single album by disc number, then track number, then title.
 * Missing disc numbers are treated as disc 1. Missing track numbers sink to
 * the end of the list. Title is the final tiebreaker.
 */
export function sortAlbumTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const discA = a.discNumber ?? 1;
    const discB = b.discNumber ?? 1;
    if (discA !== discB) return discA - discB;
    const trackA = a.trackNumber ?? Number.POSITIVE_INFINITY;
    const trackB = b.trackNumber ?? Number.POSITIVE_INFINITY;
    if (trackA !== trackB) return trackA - trackB;
    return a.title.localeCompare(b.title);
  });
}
