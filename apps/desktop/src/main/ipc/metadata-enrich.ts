import { ipcMain } from 'electron';
import { lookupMetadata, downloadImage, type MetadataLookupResult } from '../metadata-lookup';
import { writeMetadataToFile, type WriteMetadataOptions } from '../metadata-writer';
import { logger } from '../logger';
import { getMainWindow } from '../utils/window';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import {
  metadataLookupArgs,
  metadataEnrichTracksArgs,
  metadataEnrichPreviewArgs,
  metadataEnrichCancelArgs,
} from './schemas/metadata';

export interface EnrichTrackInput {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  genre: string;
  year: number | null;
  trackNumber: number | null;
}

export interface EnrichTrackResult {
  id: string;
  success: boolean;
  updatedFields: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
    year: number;
    trackNumber: number;
    albumArt: string;
  }>;
  source: string;
  error?: string;
}

export interface EnrichProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
}

export const ENRICH_BUSY_ERROR_CODE = 'metadata.enrich_busy';

/**
 * Active enrichment AbortController. Set when a batch run starts and cleared
 * on exit. The `metadata:enrich:cancel` IPC aborts whichever is current.
 *
 * Concurrent runs are not supported: the renderer disables the per-track menu
 * entry while a bulk run is in flight (and vice versa) and the
 * `metadata:enrich:preview` handler rejects with `metadata.enrich_busy` if the
 * slot is taken — so a single slot is enough for v1.
 */
let activeEnrichAbort: AbortController | null = null;

/**
 * Compute the proposed updated fields for a single track from a lookup result.
 * `onlyMissing` mirrors the bulk gate at the renderer + this file's previous
 * inline check: when true, only fill fields that are absent or set to the
 * 'Unknown Artist' / 'Unknown Album' sentinels written by the scanner.
 */
function computeUpdatedFields(
  track: EnrichTrackInput,
  lookup: MetadataLookupResult,
  onlyMissing: boolean
): EnrichTrackResult['updatedFields'] {
  const updatedFields: EnrichTrackResult['updatedFields'] = {};

  if (onlyMissing) {
    if (track.artist === 'Unknown Artist' && lookup.artist) {
      updatedFields.artist = lookup.artist;
    }
    if (track.album === 'Unknown Album' && lookup.album) {
      updatedFields.album = lookup.album;
    }
    if (!track.genre && lookup.genre) {
      updatedFields.genre = lookup.genre;
    }
    if (!track.year && lookup.year) {
      updatedFields.year = lookup.year;
    }
    if (!track.trackNumber && lookup.trackNumber) {
      updatedFields.trackNumber = lookup.trackNumber;
    }
  } else {
    if (lookup.artist) updatedFields.artist = lookup.artist;
    if (lookup.album) updatedFields.album = lookup.album;
    if (lookup.genre) updatedFields.genre = lookup.genre;
    if (lookup.year) updatedFields.year = lookup.year;
    if (lookup.trackNumber) updatedFields.trackNumber = lookup.trackNumber;
  }

  return updatedFields;
}

interface EnrichOneOptions {
  writeToFile: boolean;
  onlyMissing: boolean;
  /**
   * When 'preview', the helper performs the lookup + cover-art download (and
   * caches the cover via `saveAlbumArt` so the renderer can show it without
   * a second round-trip), but does NOT write tags to the file regardless of
   * `writeToFile`. Use this for the per-track confirmation flow.
   */
  mode: 'apply' | 'preview';
}

interface EnrichOneProgressHooks {
  onSearching?: () => void;
  onDownloading?: () => void;
  onWriting?: () => void;
}

/**
 * Per-track enrichment body shared by the bulk handler and the preview handler.
 * Throws if `signal` aborts mid-flight; the caller decides whether to record a
 * cancelled progress event or simply return.
 */
export async function enrichSingleTrack(
  track: EnrichTrackInput,
  options: EnrichOneOptions,
  signal: AbortSignal,
  hooks: EnrichOneProgressHooks = {}
): Promise<EnrichTrackResult> {
  hooks.onSearching?.();

  const lookup = await lookupMetadata(track.title, track.artist, signal);

  if (lookup.source === 'none') {
    return {
      id: track.id,
      success: false,
      updatedFields: {},
      source: 'none',
      error: 'No metadata found',
    };
  }

  const updatedFields = computeUpdatedFields(track, lookup, options.onlyMissing);

  // Cover art: skip download when the track already has art and onlyMissing
  // is true. For preview we still resolve the cover so the dialog can show it.
  let coverImageBuffer: Buffer | undefined;
  let coverImageMime: string | undefined;
  const needsCover = options.onlyMissing ? !track.albumArt : true;

  if (lookup.coverImageUrl && needsCover) {
    hooks.onDownloading?.();
    try {
      coverImageBuffer = await downloadImage(lookup.coverImageUrl, signal);
      coverImageMime = lookup.coverImageUrl.toLowerCase().includes('.png')
        ? 'image/png'
        : 'image/jpeg';
    } catch (dlError) {
      logger.warn(`[metadata:enrich] Failed to download cover art for "${track.title}":`, dlError);
    }
  }

  if (options.mode === 'apply' && options.writeToFile) {
    hooks.onWriting?.();
    const writeOptions: WriteMetadataOptions = {
      ...updatedFields,
      coverImageBuffer,
      coverImageMime,
    };
    const albumArtUrl = await writeMetadataToFile(track.filePath, writeOptions, signal);
    if (albumArtUrl) {
      updatedFields.albumArt = albumArtUrl;
    }
  } else if (coverImageBuffer && coverImageMime) {
    // Either preview mode or apply-without-file-write: cache the cover so the
    // renderer can display + commit it via DB-only update. Orphaned cache
    // entries (preview-then-discard) are harmless and dedupe by content hash.
    const { saveAlbumArt } = await import('../art-protocol');
    const albumArtUrl = await saveAlbumArt(coverImageBuffer, coverImageMime);
    if (albumArtUrl) {
      updatedFields.albumArt = albumArtUrl;
    }
  }

  const fieldCount = Object.keys(updatedFields).length;
  return {
    id: track.id,
    success: fieldCount > 0,
    updatedFields,
    source: lookup.source,
  };
}

export function registerMetadataEnrichHandlers(): void {
  // Look up metadata for a single track (for preview / confirmation)
  handle(
    'metadata:lookup',
    async (_event, title: string, artist: string): Promise<MetadataLookupResult> => {
      return lookupMetadata(title, artist);
    },
    { schema: metadataLookupArgs }
  );

  // Cancel ongoing enrichment. No-op when idle — avoids leaving stale state
  // that would poison the next run (which the old boolean flag could not prevent).
  handle(
    'metadata:enrich:cancel',
    async () => {
      if (activeEnrichAbort) {
        logger.info('[metadata:enrich] Cancellation requested');
        activeEnrichAbort.abort('user-cancelled');
      } else {
        logger.info('[metadata:enrich] Cancel requested with no active enrichment');
      }
    },
    { schema: metadataEnrichCancelArgs }
  );

  // Single-track preview: lookup-only, returns the would-be updatedFields plus
  // the cover-art URL (cached but uncommitted) so the renderer can show a diff
  // and let the user explicitly Apply or Discard. Never writes to the audio
  // file, never updates the DB. Rejects with `metadata.enrich_busy` if a bulk
  // run holds the abort slot.
  handle(
    'metadata:enrich:preview',
    async (
      _event,
      track: EnrichTrackInput,
      options: { onlyMissing: boolean }
    ): Promise<EnrichTrackResult> => {
      if (activeEnrichAbort) {
        throw new IpcError(
          ENRICH_BUSY_ERROR_CODE,
          'Another metadata enrichment run is already in progress.'
        );
      }

      logger.info(
        `[metadata:enrich:preview] Previewing "${track.title}" (onlyMissing: ${options.onlyMissing})`
      );

      const abort = new AbortController();
      activeEnrichAbort = abort;
      try {
        const result = await enrichSingleTrack(
          track,
          { writeToFile: false, onlyMissing: options.onlyMissing, mode: 'preview' },
          abort.signal
        );
        logger.info(
          `[metadata:enrich:preview] Done: "${track.title}" (source: ${result.source}, fields: ${Object.keys(result.updatedFields).join(', ') || 'none'})`
        );
        return result;
      } catch (error) {
        if (abort.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          // Cancellation surfaces as a no-match style result so the renderer
          // can render a "cancelled" state without a thrown error.
          return {
            id: track.id,
            success: false,
            updatedFields: {},
            source: 'none',
            error: 'cancelled',
          };
        }
        throw error;
      } finally {
        if (activeEnrichAbort === abort) activeEnrichAbort = null;
      }
    },
    { schema: metadataEnrichPreviewArgs }
  );

  // Batch enrich multiple tracks
  handle(
    'metadata:enrich:tracks',
    async (
      _event,
      tracks: EnrichTrackInput[],
      options: { writeToFile: boolean; onlyMissing: boolean }
    ): Promise<EnrichTrackResult[]> => {
      logger.info(
        `[metadata:enrich] Starting batch enrichment: ${tracks.length} tracks (writeToFile: ${options.writeToFile}, onlyMissing: ${options.onlyMissing})`
      );

      const abort = new AbortController();
      activeEnrichAbort = abort;
      const { signal } = abort;
      const results: EnrichTrackResult[] = [];

      const sendProgress = (progress: EnrichProgress) => {
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('metadata:enrich:progress', progress);
        }
      };

      for (let i = 0; i < tracks.length; i++) {
        if (signal.aborted) {
          logger.info(`[metadata:enrich] Cancelled at track ${i + 1}/${tracks.length}`);
          sendProgress({
            current: i + 1,
            total: tracks.length,
            trackName: tracks[i].title,
            status: 'cancelled',
          });
          break;
        }

        const track = tracks[i];

        try {
          const result = await enrichSingleTrack(
            track,
            { writeToFile: options.writeToFile, onlyMissing: options.onlyMissing, mode: 'apply' },
            signal,
            {
              onSearching: () =>
                sendProgress({
                  current: i + 1,
                  total: tracks.length,
                  trackName: track.title,
                  status: 'searching',
                }),
              onDownloading: () =>
                sendProgress({
                  current: i + 1,
                  total: tracks.length,
                  trackName: track.title,
                  status: 'downloading',
                }),
              onWriting: () =>
                sendProgress({
                  current: i + 1,
                  total: tracks.length,
                  trackName: track.title,
                  status: 'writing',
                }),
            }
          );

          const fieldCount = Object.keys(result.updatedFields).length;
          if (result.source === 'none') {
            logger.info(
              `[metadata:enrich] [${i + 1}/${tracks.length}] No results: "${track.title}"`
            );
          } else {
            logger.info(
              `[metadata:enrich] [${i + 1}/${tracks.length}] ${fieldCount > 0 ? 'Updated' : 'No changes'}: "${track.title}" (source: ${result.source}, fields: ${fieldCount > 0 ? Object.keys(result.updatedFields).join(', ') : 'none'})`
            );
          }

          results.push(result);
          sendProgress({
            current: i + 1,
            total: tracks.length,
            trackName: track.title,
            status: 'done',
          });
        } catch (error) {
          if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
            sendProgress({
              current: i + 1,
              total: tracks.length,
              trackName: track.title,
              status: 'cancelled',
            });
            break;
          }
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`[metadata:enrich] Failed to enrich "${track.title}":`, error);

          results.push({
            id: track.id,
            success: false,
            updatedFields: {},
            source: 'none',
            error: errorMessage,
          });

          sendProgress({
            current: i + 1,
            total: tracks.length,
            trackName: track.title,
            status: 'error',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      logger.info(
        `[metadata:enrich] Batch complete: ${successCount} updated, ${failedCount} failed/no-results out of ${tracks.length} tracks${signal.aborted ? ' (cancelled)' : ''}`
      );

      if (activeEnrichAbort === abort) activeEnrichAbort = null;

      return results;
    },
    { schema: metadataEnrichTracksArgs }
  );
}

export function cleanupMetadataEnrichHandlers(): void {
  ipcMain.removeHandler('metadata:lookup');
  ipcMain.removeHandler('metadata:enrich:cancel');
  ipcMain.removeHandler('metadata:enrich:preview');
  ipcMain.removeHandler('metadata:enrich:tracks');
}
