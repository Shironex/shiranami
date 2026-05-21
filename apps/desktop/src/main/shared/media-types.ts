/**
 * Centralized audio + image extension sets and MIME lookups.
 *
 * These were previously re-declared per file (`audio-protocol.ts`,
 * `art-protocol.ts`, `metadata-service.ts`, `radio-protocol.ts`), drifting
 * over time. Extensions are stored lowercase with the leading dot, matching
 * `path.extname(...).toLowerCase()`.
 */

/** Audio file extensions the app can serve, scan, and tag. */
export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.opus',
  '.wma',
  '.weba',
  '.webm',
]);

/** Image (cover-art) extensions the art protocol will serve. */
export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.weba': 'audio/webm',
  '.webm': 'audio/webm',
};

const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

/**
 * Fallback content type for audio streams of unknown extension (radio proxy,
 * streamed downloads). MP3 is the safe default for the radio use case.
 */
export const DEFAULT_AUDIO_MIME = 'audio/mpeg';

/** Fallback content type for cover-art bytes of unknown extension. */
export const DEFAULT_IMAGE_MIME = 'image/jpeg';

/** Resolve an audio MIME type from a file extension (e.g. `.mp3`). */
export function audioMime(ext: string): string {
  return AUDIO_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve an image MIME type from a file extension, defaulting to JPEG. */
export function imageMime(ext: string): string {
  return IMAGE_MIME[ext.toLowerCase()] ?? DEFAULT_IMAGE_MIME;
}

/** True when `filePath`'s extension is a supported audio format. */
export function isAudioExtension(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return false;
  return AUDIO_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}
