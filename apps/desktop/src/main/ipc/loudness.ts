import { ipcMain } from 'electron';
import type {
  LoudnessAnalyzeInput,
  LoudnessAnalyzeResult,
  LoudnessProgress,
} from '@shiranami/contracts';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { tracks, eq } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { logger } from '../logger';
import { sendToRenderer } from '../utils/window';
import { measureLoudness } from '../loudness-service';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import { loudnessAnalyzeArgs, loudnessCancelArgs } from './schemas/loudness';

const C = IPC_CHANNELS.loudness;

export const LOUDNESS_BUSY_ERROR_CODE = 'loudness.busy';

/**
 * Active analysis AbortController. Only one batch may run at a time — the
 * renderer disables the trigger while a run is in flight; the handler also
 * rejects with `loudness.busy` if the slot is taken.
 */
let activeAbort: AbortController | null = null;

export function registerLoudnessHandlers(): void {
  handle(
    C.cancel,
    async () => {
      if (activeAbort) {
        logger.info('[loudness] Cancellation requested');
        activeAbort.abort('user-cancelled');
      }
    },
    { schema: loudnessCancelArgs }
  );

  handle(
    C.analyze,
    async (_event, input: LoudnessAnalyzeInput[]): Promise<LoudnessAnalyzeResult> => {
      if (activeAbort) {
        throw new IpcError(
          LOUDNESS_BUSY_ERROR_CODE,
          'A loudness analysis run is already in progress.'
        );
      }

      const total = input.length;
      logger.info(`[loudness] Starting analysis: ${total} tracks`);

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
            } satisfies LoudnessProgress);
            break;
          }

          const track = input[i];

          // Skip tracks already analysed — re-reading the row keeps the run
          // idempotent even if the renderer passes a stale "needs analysis" set.
          const existing = db
            .select({ loudnessLufs: tracks.loudnessLufs })
            .from(tracks)
            .where(eq(tracks.id, track.id))
            .get();
          if (existing && existing.loudnessLufs !== null) {
            skipped++;
            sendToRenderer(C.progress, {
              current: i + 1,
              total,
              trackName: track.title,
              status: 'skipped',
            } satisfies LoudnessProgress);
            continue;
          }

          sendToRenderer(C.progress, {
            current: i + 1,
            total,
            trackName: track.title,
            status: 'analyzing',
          } satisfies LoudnessProgress);

          try {
            const lufs = await measureLoudness(track.filePath, abort.signal);
            if (lufs === null) {
              // Non-finite / missing file / ffmpeg unavailable — skip silently.
              skipped++;
              sendToRenderer(C.progress, {
                current: i + 1,
                total,
                trackName: track.title,
                status: 'skipped',
              } satisfies LoudnessProgress);
              continue;
            }

            db.update(tracks).set({ loudnessLufs: lufs }).where(eq(tracks.id, track.id)).run();
            analyzed++;
            sendToRenderer(C.progress, {
              current: i + 1,
              total,
              trackName: track.title,
              status: 'done',
            } satisfies LoudnessProgress);
          } catch (error) {
            if (abort.signal.aborted) break;
            failed++;
            logger.error(`[loudness] Failed to analyse "${track.title}":`, error);
            sendToRenderer(C.progress, {
              current: i + 1,
              total,
              trackName: track.title,
              status: 'error',
            } satisfies LoudnessProgress);
          }
        }

        logger.info(
          `[loudness] Analysis complete: ${analyzed} analysed, ${skipped} skipped, ${failed} failed of ${total}`
        );
        return { analyzed, skipped, failed };
      } finally {
        if (activeAbort === abort) activeAbort = null;
      }
    },
    { schema: loudnessAnalyzeArgs }
  );
}

export function cleanupLoudnessHandlers(): void {
  ipcMain.removeHandler(C.analyze);
  ipcMain.removeHandler(C.cancel);
}
