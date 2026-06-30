import { app, dialog, shell } from 'electron';
import * as Sentry from '@sentry/electron/main';
import { logger, flushLogs, getLogsDir } from './logger';

// Mirrors the E2E hatch in index.ts: under @playwright/test we must never raise
// a modal dialog (it would block the test harness with no way to dismiss it).
// We fail fast with a non-zero exit instead so the spec observes the dead app.
const isE2E = process.env.SHIRANAMI_E2E === '1';

/** Index of the "Open Logs Folder" button in the failure dialog. */
const OPEN_LOGS_BUTTON = 0;

/**
 * Last-resort handler for a bootstrap failure that happens BEFORE the main
 * window exists (e.g. the schema-downgrade guard in runMigrations throwing).
 *
 * Without this the process is a zombie: bootstrap rejected, no window was ever
 * created, and on Windows there is no `window-all-closed` event to quit on, so
 * the app stays alive, invisible, and the only trace is a log file the user has
 * to hunt for manually. This surfaces a native error dialog (which, unlike a
 * BrowserWindow, works with no renderer) with an affordance to open the logs
 * folder, then exits with a non-zero code.
 *
 * Ordering is deliberate: the logger buffers entries and only flushes on an
 * interval, so we `flushLogs()` (and `Sentry.flush()`) BEFORE exit — otherwise
 * the error line could still be in-buffer and the "Open Logs Folder" button
 * would open an empty folder.
 */
export async function reportBootFailure(error: unknown): Promise<void> {
  logger.error('Failed to bootstrap application:', error);
  Sentry.captureException(error);

  // Persist the error to disk and best-effort flush it to Sentry before we
  // exit — both are buffered and would otherwise be lost on a fast exit.
  await flushLogs().catch(() => {});
  await Sentry.flush(2000).catch(() => {});

  const detail =
    `Shiranami ran into a problem while opening your library and had to stop.\n\n` +
    `${error instanceof Error ? error.message : String(error)}\n\n` +
    `Technical details have been saved to the logs folder.`;

  // E2E: skip the modal (it would hang the harness) and fail fast.
  if (isE2E) {
    app.exit(1);
    return;
  }

  try {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Shiranami could not start',
      message: 'Shiranami could not start',
      detail,
      buttons: ['Open Logs Folder', 'Quit'],
      defaultId: OPEN_LOGS_BUTTON,
      cancelId: 1,
      noLink: true,
    });

    if (response === OPEN_LOGS_BUTTON) {
      await shell.openPath(getLogsDir()).catch(() => {});
    }
  } catch (dialogError) {
    // A dialog failure must not strand the zombie process — fall through to exit.
    logger.error('Failed to show boot-failure dialog:', dialogError);
  }

  app.exit(1);
}
