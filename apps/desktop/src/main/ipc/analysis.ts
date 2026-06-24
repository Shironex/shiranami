import { ipcMain } from 'electron';
import type {
  AnalysisAnalyzeInput,
  AnalysisAnalyzeResult,
  AnalysisProgress,
} from '@shiranami/contracts';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { tracks, eq } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { logger } from '../app/logger';
import { sendToRenderer } from '../utils/window';
import { analyzeTrack } from '../services/analysis-service';
import { shutdownAnalysisWorker } from '../workers/analysis-host';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import { analysisAnalyzeArgs, analysisCancelArgs } from './schemas/analysis';

const C = IPC_CHANNELS.analysis;

export const ANALYSIS_BUSY_ERROR_CODE = 'analysis.busy';

/** Log a progress line every N analysed/skipped tracks for longer runs. */
const PROGRESS_LOG_EVERY = 10;

/**
 * Active analysis AbortController. Only one batch may run at a time — the
 * renderer disables the trigger while a run is in flight; the handler also
 * rejects with `analysis.busy` if the slot is taken.
 */
let activeAbort: AbortController | null = null;

export function registerAnalysisHandlers(): void {
  handle(
    C.cancel,
    async () => {
      if (activeAbort) {
        logger.info('[analysis] Cancellation requested');
        activeAbort.abort('user-cancelled');
      }
    },
    { schema: analysisCancelArgs }
  );

  handle(
    C.analyze,
    async (_event, input: AnalysisAnalyzeInput[]): Promise<AnalysisAnalyzeResult> => {
      if (activeAbort) {
        throw new IpcError(
          ANALYSIS_BUSY_ERROR_CODE,
          'A musical-analysis run is already in progress.'
        );
      }

      const total = input.length;
      logger.info(`[analysis] Starting analysis: ${total} tracks`);

      const abort = new AbortController();
      activeAbort = abort;
      const db = getDatabase();

      let analyzed = 0;
      let skipped = 0;
      let failed = 0;

      try {
        for (let i = 0; i < total; i++) {
          if (abort.signal.aborted) {
            sendToRenderer(C.progress, {
              current: i,
              total,
              trackName: input[i]?.title ?? '',
              status: 'cancelled',
            } satisfies AnalysisProgress);
            break;
          }

          const track = input[i];

          // Skip tracks already analysed — re-reading the row keeps the run
          // idempotent even if the renderer passes a stale "needs analysis" set.
          // "Analysed" means EITHER dimension is set: one decode estimates both
          // tempo and key and writes both columns atomically, so a beatless track
          // (key set, bpm null) is a complete result, not a partial one. The
          // estimators are deterministic, so re-running would only reproduce the
          // same nulls — re-analysis after a future algorithm change is a separate
          // concern, not this batch's job. This pairs with the renderer's pending
          // filter (bpm == null && musicalKey == null). The single-batch
          // `activeAbort` guard means no other writer races this row.
          const existing = db
            .select({ bpm: tracks.bpm, musicalKey: tracks.musicalKey })
            .from(tracks)
            .where(eq(tracks.id, track.id))
            .get();
          if (existing && (existing.bpm !== null || existing.musicalKey !== null)) {
            skipped++;
            sendToRenderer(C.progress, {
              current: i + 1,
              total,
              trackName: track.title,
              status: 'skipped',
            } satisfies AnalysisProgress);
            continue;
          }

          sendToRenderer(C.progress, {
            current: i + 1,
            total,
            trackName: track.title,
            status: 'analyzing',
          } satisfies AnalysisProgress);

          try {
            const result = await analyzeTrack(track.filePath, abort.signal);
            if (abort.signal.aborted) {
              // Cancellation resolves analyzeTrack to null; report it as
              // cancelled rather than letting the null branch mark it skipped.
              sendToRenderer(C.progress, {
                current: i,
                total,
                trackName: track.title,
                status: 'cancelled',
              } satisfies AnalysisProgress);
              break;
            }
            if (result === null) {
              // Undecodable / nothing detectable / missing file — skip silently.
              skipped++;
              sendToRenderer(C.progress, {
                current: i + 1,
                total,
                trackName: track.title,
                status: 'skipped',
              } satisfies AnalysisProgress);
              continue;
            }

            db.update(tracks)
              .set({ bpm: result.bpm, musicalKey: result.musicalKey })
              .where(eq(tracks.id, track.id))
              .run();
            analyzed++;
            logger.info(
              `[analysis] Analysed "${track.title}": ${
                result.bpm !== null ? `${result.bpm.toFixed(1)} BPM` : 'no tempo'
              }, ${result.musicalKey ?? 'no key'}`
            );
            if ((i + 1) % PROGRESS_LOG_EVERY === 0) {
              logger.info(`[analysis] Progress: ${i + 1}/${total} processed`);
            }
            sendToRenderer(C.progress, {
              current: i + 1,
              total,
              trackName: track.title,
              status: 'done',
            } satisfies AnalysisProgress);
          } catch (error) {
            if (abort.signal.aborted) break;
            failed++;
            logger.error(`[analysis] Failed to analyse "${track.title}":`, error);
            sendToRenderer(C.progress, {
              current: i + 1,
              total,
              trackName: track.title,
              status: 'error',
            } satisfies AnalysisProgress);
          }
        }

        logger.info(
          `[analysis] Analysis complete: ${analyzed} analysed, ${skipped} skipped, ${failed} failed of ${total}`
        );
        return { analyzed, skipped, failed };
      } finally {
        if (activeAbort === abort) activeAbort = null;
      }
    },
    { schema: analysisAnalyzeArgs }
  );
}

export function cleanupAnalysisHandlers(): void {
  ipcMain.removeHandler(C.analyze);
  ipcMain.removeHandler(C.cancel);
  // Abort an in-flight batch BEFORE terminating the worker so the in-flight
  // analysis resolves to null (skip) rather than racing teardown.
  activeAbort?.abort('shutdown');
  shutdownAnalysisWorker();
}
