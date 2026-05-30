import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { getFFmpegPath, isFFmpegInstalled } from './ffmpeg-manager';
import { saveAlbumArt } from './art-protocol';
import { logger } from './logger';

export interface WriteMetadataOptions {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  genre?: string;
  // Numeric tags accept three states: `undefined` leaves the existing frame
  // untouched, `null` clears it from the file (so it matches a deliberately
  // emptied DB column), and a number sets it.
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  coverImageBuffer?: Buffer;
  coverImageMime?: string;
}

/**
 * Write metadata and/or cover art into an audio file.
 * Returns the shiranami-art:// URL if cover art was saved, or null.
 *
 * When `signal` is provided it is forwarded to the ffmpeg child process
 * so cancellation terminates the encode promptly. node-id3 and flac-tagger
 * use synchronous writes and cannot be interrupted mid-call.
 */
export async function writeMetadataToFile(
  filePath: string,
  options: WriteMetadataOptions,
  signal?: AbortSignal
): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  logger.info(`[metadata-writer] Writing tags to "${fileName}" (${ext})`);

  let albumArtUrl: string | null = null;

  // Save cover art to disk cache regardless of format
  if (options.coverImageBuffer && options.coverImageMime) {
    albumArtUrl = await saveAlbumArt(options.coverImageBuffer, options.coverImageMime);
  }

  try {
    switch (ext) {
      case '.mp3':
        await writeMp3Tags(filePath, options);
        break;
      case '.flac':
        await writeFlacTags(filePath, options);
        break;
      case '.m4a':
      case '.ogg':
      case '.opus':
      case '.aac':
      case '.wma':
      case '.weba':
      case '.webm':
        await writeTagsWithFFmpeg(filePath, options, signal);
        break;
      default:
        logger.warn(`[metadata-writer] Unsupported format for writing: ${ext}`);
        break;
    }
  } catch (error) {
    logger.error(`[metadata-writer] Failed to write tags to ${filePath}:`, error);
    // Don't throw — the DB update and album art save still succeed
  }

  return albumArtUrl;
}

async function writeMp3Tags(filePath: string, options: WriteMetadataOptions): Promise<void> {
  // node-id3 is CJS — dynamic import wraps exports under .default in bundled contexts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeID3Module = (await import('node-id3')) as any;
  const NodeID3 = NodeID3Module.default ?? NodeID3Module;

  const tags: Record<string, unknown> = {};
  if (options.title !== undefined) tags.title = options.title;
  if (options.artist !== undefined) tags.artist = options.artist;
  // node-id3 maps `performerInfo` to the TPE2 frame (album artist / band).
  if (options.albumArtist !== undefined) tags.performerInfo = options.albumArtist;
  if (options.album !== undefined) tags.album = options.album;
  if (options.genre !== undefined) tags.genre = options.genre;
  // node-id3 `update()` rebuilds frames from the merged tag set, and an empty
  // string yields no frame — so writing '' for an explicit null drops the frame.
  if (options.year === null) tags.year = '';
  else if (options.year !== undefined) tags.year = String(options.year);
  if (options.trackNumber === null) tags.trackNumber = '';
  else if (options.trackNumber !== undefined) tags.trackNumber = String(options.trackNumber);
  // node-id3 maps `partOfSet` to the TPOS frame (disc number).
  if (options.discNumber === null) tags.partOfSet = '';
  else if (options.discNumber !== undefined) tags.partOfSet = String(options.discNumber);

  if (options.coverImageBuffer) {
    tags.image = {
      mime: options.coverImageMime || 'image/jpeg',
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: options.coverImageBuffer,
    };
  }

  if (Object.keys(tags).length === 0) return;

  // update() preserves existing tags, write() replaces all
  const result = NodeID3.update(tags, filePath);
  if (result instanceof Error) {
    throw result;
  }
}

async function writeFlacTags(filePath: string, options: WriteMetadataOptions): Promise<void> {
  const { writeFlacTags: writeFlac } = await import('flac-tagger');

  const tagMap: Record<string, string> = {};
  if (options.title !== undefined) tagMap.title = options.title;
  if (options.artist !== undefined) tagMap.artist = options.artist;
  if (options.albumArtist !== undefined) tagMap.albumartist = options.albumArtist;
  if (options.album !== undefined) tagMap.album = options.album;
  if (options.genre !== undefined) tagMap.genre = options.genre;
  // flac-tagger rebuilds the vorbis comment block from this tagMap, so omitting
  // a key clears it from the file when the user emptied it (null).
  if (options.year != null) tagMap.date = String(options.year);
  if (options.trackNumber != null) tagMap.tracknumber = String(options.trackNumber);
  if (options.discNumber != null) tagMap.discnumber = String(options.discNumber);

  const tags: { tagMap: Record<string, string>; picture?: { buffer: Buffer } } = {
    tagMap,
  };

  if (options.coverImageBuffer) {
    tags.picture = {
      buffer: options.coverImageBuffer,
    };
  }

  if (Object.keys(tagMap).length === 0 && !tags.picture) return;

  await writeFlac(tags, filePath);
}

async function writeTagsWithFFmpeg(
  filePath: string,
  options: WriteMetadataOptions,
  signal?: AbortSignal
): Promise<void> {
  if (!isFFmpegInstalled()) {
    logger.warn('[metadata-writer] ffmpeg not installed, skipping tag write for:', filePath);
    return;
  }

  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, ext);
  const timestamp = Date.now();
  const tempPath = path.join(dir, `${baseName}.${timestamp}.tmp${ext}`);
  const coverTempPath = options.coverImageBuffer
    ? path.join(dir, `${baseName}.${timestamp}.tmp_cover.jpg`)
    : null;

  const args: string[] = ['-i', filePath];

  // Add cover image input if provided
  if (options.coverImageBuffer && coverTempPath) {
    await fs.promises.writeFile(coverTempPath, options.coverImageBuffer);
    args.push('-i', coverTempPath);
    args.push('-map', '0:a', '-map', '1:v', '-disposition:v', 'attached_pic');
  } else {
    // Copy audio and preserve any existing embedded video stream (album art).
    // The '?' makes the map optional — files without a video stream still write cleanly.
    args.push('-map', '0:a', '-map', '0:v?');
  }

  args.push('-c', 'copy');

  // Add metadata flags
  if (options.title !== undefined) args.push('-metadata', `title=${options.title}`);
  if (options.artist !== undefined) args.push('-metadata', `artist=${options.artist}`);
  if (options.albumArtist !== undefined)
    args.push('-metadata', `album_artist=${options.albumArtist}`);
  if (options.album !== undefined) args.push('-metadata', `album=${options.album}`);
  if (options.genre !== undefined) args.push('-metadata', `genre=${options.genre}`);
  // An empty metadata value (e.g. `track=`) makes ffmpeg drop the tag, so an
  // explicit null clears it to match a deliberately emptied DB column.
  if (options.year === null) args.push('-metadata', 'date=');
  else if (options.year !== undefined) args.push('-metadata', `date=${options.year}`);
  if (options.trackNumber === null) args.push('-metadata', 'track=');
  else if (options.trackNumber !== undefined)
    args.push('-metadata', `track=${options.trackNumber}`);
  if (options.discNumber === null) args.push('-metadata', 'disc=');
  else if (options.discNumber !== undefined) args.push('-metadata', `disc=${options.discNumber}`);

  args.push('-y', tempPath);

  try {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }

      const proc = execFile(getFFmpegPath(), args, { timeout: 30000 }, err => {
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve();
      });

      const onAbort = () => {
        proc.kill();
        reject(new DOMException('The operation was aborted', 'AbortError'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });

    // Atomic replace: rename temp over original
    await fs.promises.rename(tempPath, filePath);
  } finally {
    // Clean up temp files
    if (coverTempPath) {
      try {
        await fs.promises.unlink(coverTempPath);
      } catch {
        /* ignore */
      }
    }
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      /* ignore */
    }
  }
}
