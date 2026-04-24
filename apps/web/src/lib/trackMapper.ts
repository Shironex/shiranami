import { type Track } from '@/stores/types';
import i18n from '@/lib/i18n';

/**
 * Maps a raw DB record to a typed Track object.
 * Centralizes the conversion logic used across library loading, folder scanning, etc.
 */
export function mapDbTrackToTrack(t: Record<string, unknown>): Track {
  return {
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
    discNumber: t.discNumber as number | null | undefined,
    isFavorite: (t.isFavorite as boolean) ?? false,
    playCount: (t.playCount as number) ?? 0,
    createdAt: t.createdAt as string | undefined,
    updatedAt: t.updatedAt as string | undefined,
  };
}

/**
 * Maps an array of raw DB records to typed Track objects.
 */
export function mapDbTracksToTracks(records: Record<string, unknown>[]): Track[] {
  return records.map(mapDbTrackToTrack);
}
