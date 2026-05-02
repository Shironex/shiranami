import { type Track } from '@/stores/types';
import { type AlbumSortMode, type AlbumSortOrder } from '@/stores/useAppStore';

export interface AlbumData {
  name: string;
  artist: string;
  year: number | null;
  createdAt: string | null;
  albumArt?: string;
  trackCount: number;
  tracks: Track[];
}

/**
 * Group a flat list of tracks into album buckets.
 *
 * Each album's displayed artist is derived from the distinct artists across
 * its tracks (e.g. "Artist A, Artist B" for compilations). The album's year
 * is taken from the first track encountered for that album — good enough for
 * sort-by-year since tracks on the same album almost always share a year.
 */
export function groupTracksByAlbum(
  tracks: Track[],
  sortMode: AlbumSortMode = 'name',
  sortOrder: AlbumSortOrder = 'asc'
): AlbumData[] {
  const map = new Map<string, AlbumData>();
  const artistSets = new Map<string, Set<string>>();

  for (const track of tracks) {
    const key = track.album;
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
        name: key,
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
