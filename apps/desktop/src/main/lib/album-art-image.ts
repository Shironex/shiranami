/**
 * Pure helpers for downscaling + hashing album art bytes. Imported by both
 * `art-protocol.ts` (main-process saveAlbumArt path, used by metadata-enrich
 * IPC and base64 migration) and `scan-utility.ts` (utility process bulk-scan
 * path).
 *
 * "Pure" here means: no Electron `app.getPath`, no IPC, no logger, no fs
 * writes. Each caller layers its own disk-write step on top — main and the
 * utility have different filesystem-access patterns and different error-
 * reporting needs.
 *
 * Uses `sharp` (libvips bindings) for the decode + resize + JPEG encode.
 * Sharp is the chosen path after the Phase 0 spike showed `nativeImage` is
 * unavailable inside Electron's `utilityProcess`.
 */

import * as crypto from 'node:crypto';
import sharp from 'sharp';

/** Longer-edge clamp for cached covers. Matches art-protocol.ts. */
export const ALBUM_ART_MAX_DIMENSION = 512;
/** JPEG re-encode quality. Matches art-protocol.ts. */
export const ALBUM_ART_JPEG_QUALITY = 85;
/** Hash hex prefix length used for filenames (matches art-protocol.ts). */
export const ALBUM_ART_HASH_LENGTH = 32;

export interface DownscaledArt {
  /** Re-encoded JPEG bytes. Always JPEG regardless of source format. */
  bytes: Buffer;
  /** SHA-256 of the resized bytes, truncated to ALBUM_ART_HASH_LENGTH chars. */
  hash: string;
  /** File extension to write under, currently always `.jpg`. */
  ext: '.jpg';
  /** Filename `<hash>.jpg` — convenience. */
  fileName: string;
}

/**
 * Decode `data` with sharp, downscale so the longer edge fits within
 * ALBUM_ART_MAX_DIMENSION (no upscaling), and re-encode as JPEG q=85. Returns
 * the resized bytes plus a content-addressed hash + filename.
 *
 * Returns `null` for empty input or undecodeable data — sharp throws a
 * `VipsImage` error for garbage buffers; we swallow it and surface null so
 * callers can early-return without try/catch boilerplate.
 */
export async function downscaleAndHash(
  data: Buffer | Uint8Array | null | undefined
): Promise<DownscaledArt | null> {
  if (!data || data.length === 0) return null;

  const input = Buffer.isBuffer(data) ? data : Buffer.from(data);

  let bytes: Buffer;
  try {
    bytes = await sharp(input)
      .resize({
        width: ALBUM_ART_MAX_DIMENSION,
        height: ALBUM_ART_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: ALBUM_ART_JPEG_QUALITY })
      .toBuffer();
  } catch {
    // Undecodeable input — covers garbage payloads, zero-length frames, and
    // exotic formats sharp/libvips doesn't grok. Treat as "no art".
    return null;
  }

  const hash = crypto
    .createHash('sha256')
    .update(bytes)
    .digest('hex')
    .slice(0, ALBUM_ART_HASH_LENGTH);
  return {
    bytes,
    hash,
    ext: '.jpg',
    fileName: `${hash}.jpg`,
  };
}
