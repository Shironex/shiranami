import * as path from 'path';
import { logger } from './logger';

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  genre: string;
  year: number | null;
  trackNumber: number | null;
  albumArt: string | null; // data URL (base64)
}

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
 * Returns structured metadata with album art as a data URL.
 */
export async function parseAudioMetadata(filePath: string): Promise<TrackMetadata> {
  const mm = await getModule();

  try {
    const metadata = await mm.parseFile(filePath, { skipCovers: false });
    const common = metadata.common;
    const format = metadata.format;

    // Extract album art as data URL
    let albumArt: string | null = null;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      const base64 = Buffer.from(pic.data).toString('base64');
      albumArt = `data:${pic.format};base64,${base64}`;
    }

    // Build title fallback from filename
    const fileName = path.basename(filePath, path.extname(filePath));

    return {
      title: common.title || fileName,
      artist: common.artist || 'Unknown Artist',
      album: common.album || 'Unknown Album',
      duration: format.duration || 0,
      genre: common.genre?.[0] || '',
      year: common.year || null,
      trackNumber: common.track?.no || null,
      albumArt,
    };
  } catch (error) {
    logger.warn('Failed to parse metadata for:', filePath, error);
    const fileName = path.basename(filePath, path.extname(filePath));
    return {
      title: fileName,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: 0,
      genre: '',
      year: null,
      trackNumber: null,
      albumArt: null,
    };
  }
}

/** Audio extensions we support */
export const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.opus', '.wma', '.weba', '.webm',
]);

/** Check if a file path has a supported audio extension */
export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
