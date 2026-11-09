import { hasAlbum, normalizeAlbumTitle } from '@/lib/albums';
import { UNKNOWN_ARTIST } from '@/lib/track-meta';
import type { Track } from '@/stores/usePlayerStore';

/** Why a song is listed as similar, strongest first. */
export type SimilarReason = 'artist' | 'album' | 'genre';

export interface SimilarEntry {
  track: Track;
  reason: SimilarReason;
}

/** The player card lists at most this many; the library can be large. */
export const SIMILAR_LIMIT = 40;

const RANK: Record<SimilarReason, number> = { artist: 0, album: 1, genre: 2 };

const key = (value: string) => value.trim().toLocaleLowerCase();

/** Genre tags of a track: a genre field can hold several, split by ; , / or |. */
export function genreTags(genre: string | null | undefined): string[] {
  if (!genre) return [];
  return genre
    .split(/[;,/|]/)
    .map(key)
    .filter(tag => tag.length > 0);
}

function artistKey(track: Track): string | null {
  return track.artist && track.artist !== UNKNOWN_ARTIST ? key(track.artist) : null;
}

function albumKey(track: Track): string | null {
  return hasAlbum(track) ? key(normalizeAlbumTitle(track.album)) : null;
}

/**
 * Songs from the local library that go with `current`: the same artist
 * first, then the same album (compilations, features), then a shared genre
 * tag. Within a group the most played come first. Live streams, the song
 * itself and repeats of it are left out. Built only from tags already on
 * the phone, so it works offline.
 */
export function similarTracks(
  library: readonly Track[],
  current: Track,
  limit: number = SIMILAR_LIMIT
): SimilarEntry[] {
  const artist = artistKey(current);
  const album = albumKey(current);
  const genres = new Set(genreTags(current.genre));
  const seen = new Set<string>([current.id]);
  const found: SimilarEntry[] = [];

  for (const track of library) {
    if (track.isLive || seen.has(track.id)) continue;
    let reason: SimilarReason | null = null;
    if (artist && artistKey(track) === artist) reason = 'artist';
    else if (album && albumKey(track) === album) reason = 'album';
    else if (genres.size > 0 && genreTags(track.genre).some(tag => genres.has(tag))) {
      reason = 'genre';
    }
    if (!reason) continue;
    seen.add(track.id);
    found.push({ track, reason });
  }

  found.sort(
    (a, b) =>
      RANK[a.reason] - RANK[b.reason] ||
      (b.track.playCount ?? 0) - (a.track.playCount ?? 0) ||
      a.track.title.localeCompare(b.track.title)
  );
  return found.slice(0, limit);
}

const REASON_LABEL: Record<SimilarReason, string> = {
  artist: 'Same artist',
  album: 'Same album',
  genre: 'Same genre',
};

export function similarReasonLabel(reason: SimilarReason): string {
  return REASON_LABEL[reason];
}
