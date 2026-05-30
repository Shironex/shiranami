import * as path from 'path';
import type { TrackMetadata } from '@shiranami/contracts';
import { logger } from './logger';
import { saveAlbumArt } from './art-protocol';
import { isAudioExtension } from './shared/media-types';

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
      artist: common.artist || 'Unknown Artist',
      // Prefer the dedicated albumartist tag; fall back to the track artist so
      // album grouping always has a stable key even for untagged files.
      albumArtist: common.albumartist || common.artist || null,
      album: common.album || 'Unknown Album',
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
      artist: 'Unknown Artist',
      albumArtist: null,
      album: 'Unknown Album',
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
export { AUDIO_EXTENSIONS } from './shared/media-types';

/** Check if a file path has a supported audio extension */
export function isAudioFile(filePath: string): boolean {
  return isAudioExtension(filePath);
}
