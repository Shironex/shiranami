import { ipcMain } from 'electron';
import type { EnrichTrackInput, EnrichTrackResult, EnrichProgress } from '@shiranami/contracts';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { lookupMetadata, type MetadataLookupResult } from '../metadata-lookup';
import { logger } from '../logger';
import { sendToRenderer } from '../utils/window';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import { enrichSingleTrack, runEnrichmentBatch } from '../metadata-enrich-batch';
import {
  metadataLookupArgs,
  metadataEnrichTracksArgs,
  metadataEnrichPreviewArgs,
  metadataEnrichCancelArgs,
} from './schemas/metadata';

const C = IPC_CHANNELS.metadata;

export type { EnrichTrackInput, EnrichTrackResult, EnrichProgress } from '@shiranami/contracts';
export { enrichSingleTrack, ENRICH_CONCURRENCY } from '../metadata-enrich-batch';

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
}

export function cleanupMetadataEnrichHandlers(): void {
  ipcMain.removeHandler(C.lookup);
  ipcMain.removeHandler(C.enrichCancel);
  ipcMain.removeHandler(C.enrichPreview);
  ipcMain.removeHandler(C.enrichTracks);
}
