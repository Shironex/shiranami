import type { SQLiteDatabase } from 'expo-sqlite';
import type { AudioLink } from '@/lib/api';
import type { SearchResult } from '@/lib/types';

/**
 * Saving a YouTube result to the library for offline play. The audio comes
 * through the server (never from YouTube directly), lands in the app's
 * tracks folder as `yt-<videoId>.<ext>` next to imports and LAN sync copies,
 * and becomes a `tracks` row with source 'youtube'. The row id is
 * `yt-<videoId>`, the same id a streamed result plays under, so one video is
 * saved at most once and a saved one plays from the phone.
 */

/** The library row id for a video, also used while it streams. */
export function youtubeTrackId(videoId: string): string {
  return `yt-${videoId}`;
}

/** Thrown when the user cancels a save. Not an error to show. */
export class SaveCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SaveCancelledError';
  }
}

export interface DownloadOptions {
  signal?: AbortSignal;
  /** Bytes written so far. */
  onBytes?: (written: number) => void;
}

/** The phone side of a save: network, files and the library lock. */
export interface SaveDeps {
  db: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;
  audioLink: (videoId: string) => Promise<AudioLink>;
  /**
   * Downloads `url` into the tracks folder as `name`, through a partial file
   * that is removed on failure or cancel. Returns the final uri and size.
   */
  download: (
    url: string,
    name: string,
    options: DownloadOptions
  ) => Promise<{ uri: string; size: number }>;
  /** Saves the cover into the art folder as `name`. Returns its uri. */
  saveCover: (url: string, name: string, signal?: AbortSignal) => Promise<string>;
  /** Runs a database write under the library lock (lib/library-scan.ts). */
  lock: <T>(job: () => Promise<T>) => Promise<T>;
}

export interface SaveOptions {
  signal?: AbortSignal;
  /** 0 to 1 as the audio comes in. */
  onProgress?: (ratio: number) => void;
}

export type SaveOutcome = 'saved' | 'already_saved';

/** Whether the library already holds this video with its file. */
export async function isSaved(
  db: Pick<SQLiteDatabase, 'getFirstAsync'>,
  videoId: string
): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM tracks WHERE id = ? AND missing = 0',
    [youtubeTrackId(videoId)]
  );
  return row != null;
}

/** A file extension from the server, or m4a when it is anything odd. */
function safeExtension(ext: string): string {
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'm4a';
}

/**
 * Saves one result. A video that is already in the library is not fetched
 * again. The cover is best effort: without it the row shows the placeholder
 * art, like any other song without artwork.
 */
export async function saveYouTubeTrack(
  deps: SaveDeps,
  result: SearchResult,
  options: SaveOptions = {}
): Promise<SaveOutcome> {
  const { signal, onProgress } = options;
  const id = youtubeTrackId(result.id);
  if (await isSaved(deps.db, result.id)) return 'already_saved';

  const link = await deps.audioLink(result.id);
  if (signal?.aborted) throw new SaveCancelledError();
  onProgress?.(0);
  const audio = await deps.download(link.url, `${id}.${safeExtension(link.ext)}`, {
    signal,
    onBytes: written => onProgress?.(link.size > 0 ? Math.min(written / link.size, 1) : 0),
  });

  let cover: string | null = null;
  if (result.thumbnail) {
    cover = await deps.saveCover(result.thumbnail, `${id}.jpg`, signal).catch(() => null);
  }

  await deps.lock(() =>
    deps.db.runAsync(
      `INSERT INTO tracks (id, file_path, title, artist, album, duration, album_art, file_size,
         source, missing)
       VALUES (?, ?, ?, ?, 'YouTube', ?, ?, ?, 'youtube', 0)
       ON CONFLICT(id) DO UPDATE SET file_path = excluded.file_path, title = excluded.title,
         artist = excluded.artist, duration = excluded.duration, album_art = excluded.album_art,
         file_size = excluded.file_size, missing = 0, updated_at = datetime('now')`,
      [
        id,
        audio.uri,
        result.title,
        result.uploader,
        result.duration > 0 ? result.duration : null,
        cover,
        audio.size,
      ]
    )
  );
  onProgress?.(1);
  return 'saved';
}
