import { ipcMain } from 'electron';
import { lookupMetadata, downloadImage, type MetadataLookupResult } from '../metadata-lookup';
import { writeMetadataToFile, type WriteMetadataOptions } from '../metadata-writer';
import { logger } from '../logger';
import { getMainWindow } from '../utils/window';
import { handle } from './with-ipc-handler';
import {
  metadataLookupArgs,
  metadataEnrichTracksArgs,
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

/**
 * Active enrichment AbortController. Set when a batch run starts and cleared
 * on exit. The `metadata:enrich:cancel` IPC aborts whichever is current.
 * Concurrent enrichment runs are not supported (the renderer gates them) so a
 * single slot is enough.
 */
let activeEnrichAbort: AbortController | null = null;

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

        sendProgress({
          current: i + 1,
          total: tracks.length,
          trackName: track.title,
          status: 'searching',
        });

        try {
          // Look up metadata
          const lookup = await lookupMetadata(track.title, track.artist, signal);

          if (lookup.source === 'none') {
            logger.info(
              `[metadata:enrich] [${i + 1}/${tracks.length}] No results: "${track.title}"`
            );
            results.push({
              id: track.id,
              success: false,
              updatedFields: {},
              source: 'none',
              error: 'No metadata found',
            });
            sendProgress({
              current: i + 1,
              total: tracks.length,
              trackName: track.title,
              status: 'done',
            });
            continue;
          }

          // Determine which fields to update
          const updatedFields: EnrichTrackResult['updatedFields'] = {};

          if (options.onlyMissing) {
            // Only fill in fields that are missing/default
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
            // Overwrite all fields with looked-up data
            if (lookup.artist) updatedFields.artist = lookup.artist;
            if (lookup.album) updatedFields.album = lookup.album;
            if (lookup.genre) updatedFields.genre = lookup.genre;
            if (lookup.year) updatedFields.year = lookup.year;
            if (lookup.trackNumber) updatedFields.trackNumber = lookup.trackNumber;
          }

          // Download cover art if available and needed
          let coverImageBuffer: Buffer | undefined;
          let coverImageMime: string | undefined;
          const needsCover = options.onlyMissing ? !track.albumArt : true;

          if (lookup.coverImageUrl && needsCover) {
            sendProgress({
              current: i + 1,
              total: tracks.length,
              trackName: track.title,
              status: 'downloading',
            });

            try {
              coverImageBuffer = await downloadImage(lookup.coverImageUrl, signal);
              // Determine MIME from URL or default to JPEG
              coverImageMime = lookup.coverImageUrl.toLowerCase().includes('.png')
                ? 'image/png'
                : 'image/jpeg';
            } catch (dlError) {
              logger.warn(
                `[metadata:enrich] Failed to download cover art for "${track.title}":`,
                dlError
              );
            }
          }

          // Write metadata to audio file if requested
          if (options.writeToFile) {
            sendProgress({
              current: i + 1,
              total: tracks.length,
              trackName: track.title,
              status: 'writing',
            });

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
            // Even if not writing to file, save cover art to disk cache
            const { saveAlbumArt } = await import('../art-protocol');
            const albumArtUrl = await saveAlbumArt(coverImageBuffer, coverImageMime);
            if (albumArtUrl) {
              updatedFields.albumArt = albumArtUrl;
            }
          }

          const fieldCount = Object.keys(updatedFields).length;
          logger.info(
            `[metadata:enrich] [${i + 1}/${tracks.length}] ${fieldCount > 0 ? 'Updated' : 'No changes'}: "${track.title}" (source: ${lookup.source}, fields: ${fieldCount > 0 ? Object.keys(updatedFields).join(', ') : 'none'})`
          );

          results.push({
            id: track.id,
            success: fieldCount > 0,
            updatedFields,
            source: lookup.source,
          });

          sendProgress({
            current: i + 1,
            total: tracks.length,
            trackName: track.title,
            status: 'done',
          });
        } catch (error) {
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
  ipcMain.removeHandler('metadata:enrich:tracks');
}
