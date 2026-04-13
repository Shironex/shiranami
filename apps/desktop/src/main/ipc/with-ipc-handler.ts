import { ipcMain } from 'electron';
import { logger } from '../logger';

type Handler<Args extends unknown[], R> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: Args
) => Promise<R> | R;

/**
 * Registers an ipcMain handler that automatically logs errors with a
 * [ipc:<channel>] prefix and rethrows them. Eliminates the try/catch/log/rethrow
 * boilerplate from individual handlers.
 */
export function handle<Args extends unknown[], R>(
  channel: string,
  handler: Handler<Args, R>,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (err) {
      logger.error(`[ipc:${channel}]`, err);
      throw err;
    }
  });
}

/**
 * Like handle(), but calls fallback(err) instead of throwing when the handler
 * errors. Use for channels that legitimately return a degraded default on failure.
 */
export function handleWithFallback<Args extends unknown[], R>(
  channel: string,
  handler: Handler<Args, R>,
  fallback: (err: unknown) => R,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (err) {
      logger.warn(`[ipc:${channel}] using fallback`, err);
      return fallback(err);
    }
  });
}
