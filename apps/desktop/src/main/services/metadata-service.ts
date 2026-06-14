import * as path from 'path';
import type { TrackMetadata } from '@shiranami/contracts';
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM } from '@shiranami/shared';
import { logger } from '../app/logger';
import { saveAlbumArt } from '../protocols/art-protocol';
import { isAudioExtension } from '../shared/media-types';

export type { TrackMetadata };

// Cache the dynamic import
let mmModule: typeof import('music-metadata') | null = null;

async function getModule() {
  if (!mmModule) {
    mmModule = await import('music-metadata');
  }
  return mmModule;
}

/**
 * Parse metadata from an audio file.
 * Returns structured metadata with album art saved to disk (shiranami-art:// URL).
 */
export async function parseAudioMetadata(filePath: string): Promise<TrackMetadata> {
  const mm = await getModule();

  try {
    const metadata = await mm.parseFile(filePath, { skipCovers: false });
    const common = metadata.common;
    const format = metadata.format;

    // Extract album art and save to disk
    let albumArt: string | null = null;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      albumArt = await saveAlbumArt(Buffer.from(pic.data), pic.format);
    }

    // Build title fallback from filename
    const fileName = path.basename(filePath, path.extname(filePath));

    return {
      title: common.title || fileName,
      artist: common.artist || UNKNOWN_ARTIST,
      // Only the dedicated albumartist tag — do NOT fall back to the track
      // artist, or an untagged various-artists album gets a per-track album
      // artist and fragments at grouping time. Null means "untagged", which
      // the grouping layer keys on the album title alone.
      albumArtist: common.albumartist?.trim() || null,
      album: common.album || UNKNOWN_ALBUM,
      duration: format.duration || 0,
      genre: common.genre?.[0] || '',
      year: common.year || null,
      trackNumber: common.track?.no ?? null,
      discNumber: common.disk?.no ?? null,
      albumArt,
    };
  } catch (error) {
    logger.warn('Failed to parse metadata for:', filePath, error);
    const fileName = path.basename(filePath, path.extname(filePath));
    return {
      title: fileName,
      artist: UNKNOWN_ARTIST,
      albumArtist: null,
      album: UNKNOWN_ALBUM,
      duration: 0,
      genre: '',
      year: null,
      trackNumber: null,
      discNumber: null,
      albumArt: null,
    };
  }
}

/** Audio extensions we support. Re-exported from the shared media-types map. */
export { AUDIO_EXTENSIONS } from '../shared/media-types';

/** Check if a file path has a supported audio extension */
export function isAudioFile(filePath: string): boolean {
  return isAudioExtension(filePath);
}
