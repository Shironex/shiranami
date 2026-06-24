import { type Track as DbTrack, type DisplayTrack } from '@shiranami/contracts';
import { type Track } from '@/stores/types';
import i18n from '@/lib/i18n';

/**
 * Input shape for the mapper: the canonical DB-mirror `Track` from
 * `@shiranami/contracts`, with every non-key field optional. The IPC boundary
 * returns these rows as `unknown[]` (drizzle rows serialized over Electron) and
 * some call sites pass partial rows, so the mapper stays defensive: it collapses
 * both missing/`undefined` and `null` to display defaults. `id`/`title`/
 * `filePath` are always present in a real row.
 */
export type DbTrackRecord = Partial<DbTrack> & Pick<DbTrack, 'id' | 'title' | 'filePath'>;

/**
 * Maps a raw DB record to a typed display Track object.
 * Centralizes the conversion logic used across library loading, folder scanning, etc.
 */
export function mapDbTrackToTrack(t: DbTrackRecord): Track {
  const display: DisplayTrack = {
    id: t.id,
    title: t.title,
    artist: t.artist ?? i18n.t('unknownArtist', { ns: 'common' }),
    albumArtist: t.albumArtist ?? null,
    album: t.album ?? i18n.t('unknownAlbum', { ns: 'common' }),
    duration: t.duration ?? 0,
    filePath: t.filePath,
    albumArt: t.albumArt ?? undefined,
    genre: t.genre,
    year: t.year,
    trackNumber: t.trackNumber,
    discNumber: t.discNumber,
    isFavorite: t.isFavorite ?? false,
    playCount: t.playCount ?? 0,
    loudnessLufs: t.loudnessLufs ?? null,
    bpm: t.bpm ?? null,
    musicalKey: t.musicalKey ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  return display;
}

/**
 * Maps an array of raw DB records to typed Track objects.
 */
export function mapDbTracksToTracks(records: DbTrackRecord[]): Track[] {
  return records.map(mapDbTrackToTrack);
}
