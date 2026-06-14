import { ipcMain } from 'electron';
import type {
  LoudnessAnalyzeInput,
  LoudnessAnalyzeResult,
  LoudnessProgress,
} from '@shiranami/contracts';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { tracks, eq } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { logger } from '../app/logger';
import { sendToRenderer } from '../utils/window';
import { measureLoudness } from '../loudness-service';
import { handle } from './with-ipc-handler';
import { IpcError } from './errors';
import { loudnessAnalyzeArgs, loudnessCancelArgs } from './schemas/loudness';

const C = IPC_CHANNELS.loudness;

export const LOUDNESS_BUSY_ERROR_CODE = 'loudness.busy';

/** Default playback target (LUFS) used only for an informative gain estimate in
 * the analysis logs. Mirrors the renderer's DEFAULT_LOUDNESS_TARGET_LUFS — the
 * actual playback gain is derived in the renderer against the user's target. */
const DEFAULT_TARGET_LUFS = -14;
/** Clamp matching LOUDNESS_MAX_GAIN_DB in the renderer's loudness store. */
const MAX_GAIN_DB = 12;
/** Log a progress line every N analysed/skipped tracks for longer runs. */
const PROGRESS_LOG_EVERY = 10;

function estimateGainDb(lufs: number): number {
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, DEFAULT_TARGET_LUFS - lufs));
}

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
            if (abort.signal.aborted) {
              // Cancellation resolves measureLoudness to null; report it as
              // cancelled rather than letting the null branch mark it skipped.
              sendToRenderer(C.progress, {
                current: i,
                total,
                trackName: track.title,
                status: 'cancelled',
              } satisfies LoudnessProgress);
              break;
            }
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
            const gainDb = estimateGainDb(lufs);
            logger.info(
              `[loudness] Analysed "${track.title}": ${lufs.toFixed(1)} LUFS → ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB (vs default ${DEFAULT_TARGET_LUFS} LUFS target)`
            );
            if ((i + 1) % PROGRESS_LOG_EVERY === 0) {
              logger.info(`[loudness] Progress: ${i + 1}/${total} processed`);
            }
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
