import type { TrackTags } from '@/modules/audio-library';

export const UNKNOWN_ARTIST = 'Unknown Artist';
export const UNKNOWN_ALBUM = 'Unknown Album';

/** What a `tracks` row stores about a file, from its tags or its name. */
export interface TrackFields {
  title: string;
  artist: string;
  album: string;
  albumArtist: string | null;
  trackNumber: number | null;
  year: number | null;
  genre: string | null;
  /** Seconds, or null when unknown. */
  duration: number | null;
  albumArt: string | null;
}

/** "Artist - Title.mp3" to its parts; a name without " - " is all title. */
export function parseTrackName(filename: string): { title: string; artist: string } {
  const name = filename.replace(/\.[^.]+$/, '');
  const dashSplit = name.split(' - ');
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim() || UNKNOWN_ARTIST,
      title: dashSplit.slice(1).join(' - ').trim() || name.trim(),
    };
  }
  return { title: name.trim() || filename, artist: UNKNOWN_ARTIST };
}

/**
 * Tags first; the filename fills only what the tags leave out (title and
 * artist), so a well tagged file never shows its filename.
 */
export function trackFields(tags: TrackTags | null, filename: string): TrackFields {
  const parsed = parseTrackName(filename);
  return {
    title: tags?.title ?? parsed.title,
    artist: tags?.artist ?? tags?.albumArtist ?? parsed.artist,
    album: tags?.album ?? UNKNOWN_ALBUM,
    albumArtist: tags?.albumArtist ?? null,
    trackNumber: tags?.trackNumber ?? null,
    year: tags?.year ?? null,
    genre: tags?.genre ?? null,
    duration: tags?.durationMs ? tags.durationMs / 1000 : null,
    albumArt: tags?.artUri ?? null,
  };
}

/** "Artist · Album" for a row's meta line, or the artist alone while the album is unknown. */
export function trackMeta(track: { artist: string; album: string }): string {
  return track.album && track.album !== UNKNOWN_ALBUM
    ? `${track.artist} · ${track.album}`
    : track.artist;
}
