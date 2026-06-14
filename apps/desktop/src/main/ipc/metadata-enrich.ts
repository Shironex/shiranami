import { ipcMain } from 'electron';
import type {
  EnrichTrackInput,
  EnrichTrackResult,
  EnrichProgress,
  WriteTagsInput,
  WriteTagsResult,
} from '@shiranami/contracts';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { tracks, eq, type NewTrack } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { lookupMetadata, type MetadataLookupResult } from '../services/metadata-lookup';
import { logger } from '../app/logger';
import { sendToRenderer } from '../utils/window';
import { writeMetadataToFile, type WriteMetadataOptions } from '../services/metadata-writer';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import { enrichSingleTrack, runEnrichmentBatch } from '../services/metadata-enrich-batch';
import {
  metadataLookupArgs,
  metadataEnrichTracksArgs,
  metadataEnrichPreviewArgs,
  metadataEnrichCancelArgs,
  metadataWriteTagsArgs,
} from './schemas/metadata';

const C = IPC_CHANNELS.metadata;

export type { EnrichTrackInput, EnrichTrackResult, EnrichProgress } from '@shiranami/contracts';
export { enrichSingleTrack, ENRICH_CONCURRENCY } from '../services/metadata-enrich-batch';

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

export function registerMetadataEnrichHandlers(): void {
  // Look up metadata for a single track (for preview / confirmation)
  handle(
    C.lookup,
    async (_event, title: string, artist: string): Promise<MetadataLookupResult> => {
      return lookupMetadata(title, artist);
    },
    { schema: metadataLookupArgs }
  );

  // Cancel ongoing enrichment. No-op when idle — avoids leaving stale state
  // that would poison the next run (which the old boolean flag could not prevent).
  handle(
    C.enrichCancel,
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
    C.enrichPreview,
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
    C.enrichTracks,
    async (
      _event,
      tracks: EnrichTrackInput[],
      options: { writeToFile: boolean; onlyMissing: boolean }
    ): Promise<EnrichTrackResult[]> => {
      if (activeEnrichAbort) {
        throw new IpcError(
          ENRICH_BUSY_ERROR_CODE,
          'Another metadata enrichment run is already in progress.'
        );
      }

      logger.info(
        `[metadata:enrich] Starting batch enrichment: ${tracks.length} tracks (writeToFile: ${options.writeToFile}, onlyMissing: ${options.onlyMissing})`
      );

      const abort = new AbortController();
      activeEnrichAbort = abort;
      try {
        return await runEnrichmentBatch(
          tracks,
          options,
          abort.signal,
          (progress: EnrichProgress) => {
            sendToRenderer(C.enrichProgress, progress);
          }
        );
      } finally {
        if (activeEnrichAbort === abort) activeEnrichAbort = null;
      }
    },
    { schema: metadataEnrichTracksArgs }
  );

  // Manual tag editor: write user-edited tags back to the audio file, then
  // update the DB row to match. The file write is best-effort — like the
  // enrichment flow, `writeMetadataToFile` swallows per-format write failures
  // internally and logs them rather than throwing, so `success: true` means
  // "the request was processed", not "every byte hit disk". The DB row is
  // updated to reflect the user's intended tags regardless.
  handle(
    C.writeTags,
    async (_event, input: WriteTagsInput): Promise<WriteTagsResult> => {
      logger.info(
        `[metadata:write-tags] Writing user-edited tags for "${input.title ?? input.id}"`
      );

      // Map the wire input to the writer options. `undefined` fields are left
      // unchanged; the writer skips any option that is undefined. `null` numeric
      // fields (cleared in the UI) are passed through so the writer CLEARS the
      // corresponding tag in the file — otherwise the DB row (nulled below) and
      // the file drift, and a rescan would restore the stale tag.
      const writeOptions: WriteMetadataOptions = {
        title: input.title,
        artist: input.artist,
        albumArtist: input.albumArtist,
        album: input.album,
        genre: input.genre,
        year: input.year,
        trackNumber: input.trackNumber,
        discNumber: input.discNumber,
      };

      try {
        await writeMetadataToFile(input.filePath, writeOptions);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[metadata:write-tags] File write failed for ${input.filePath}:`, error);
        return { success: false, error: message };
      }

      // Update the DB row. Only set fields the user actually provided so an
      // omitted field isn't clobbered. Empty strings ARE written (the user
      // deliberately cleared the tag).
      const updates: Partial<NewTrack> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.artist !== undefined) updates.artist = input.artist;
      if (input.albumArtist !== undefined) updates.albumArtist = input.albumArtist;
      if (input.album !== undefined) updates.album = input.album;
      if (input.genre !== undefined) updates.genre = input.genre;
      if (input.year !== undefined) updates.year = input.year;
      if (input.trackNumber !== undefined) updates.trackNumber = input.trackNumber;
      if (input.discNumber !== undefined) updates.discNumber = input.discNumber;

      if (Object.keys(updates).length > 0) {
        const db = getDatabase();
        db.update(tracks).set(updates).where(eq(tracks.id, input.id)).run();
      }

      return { success: true };
    },
    { schema: metadataWriteTagsArgs }
  );
}

export function cleanupMetadataEnrichHandlers(): void {
  ipcMain.removeHandler(C.lookup);
  ipcMain.removeHandler(C.enrichCancel);
  ipcMain.removeHandler(C.enrichPreview);
  ipcMain.removeHandler(C.enrichTracks);
  ipcMain.removeHandler(C.writeTags);
}
