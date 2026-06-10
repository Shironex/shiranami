import { ipcMain } from 'electron';
import * as Sentry from '@sentry/electron/main';
import type { ZodType } from 'zod';
import { logger } from '../logger';
import { IpcError } from './errors';

type Handler<Args extends unknown[], R> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: Args
) => Promise<R> | R;

/**
 * Options accepted by `handle()` / `handleWithFallback()`.
 *
 * When `schema` is provided, it must be a `z.tuple([...])` schema matching the
 * positional arguments the renderer forwards. On validation failure the
 * handler is NOT invoked — we log the zod issues and throw
 * `IpcError('BAD_REQUEST', …, issues)` so the renderer receives a stable,
 * structured error. Validation errors bypass `handleWithFallback`'s fallback
 * path: fallbacks exist for degraded upstream, not for tampered input.
 */
export interface HandleOptions<Args extends unknown[]> {
  schema?: ZodType<Args>;
}

function validateOrThrow<Args extends unknown[]>(
  channel: string,
  schema: ZodType<Args>,
  rawArgs: unknown[]
): Args {
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    logger.error(`[ipc:${channel}] validation failed`, parsed.error.issues);
    throw new IpcError('BAD_REQUEST', `Invalid payload for ${channel}`, parsed.error.issues);
  }
  return parsed.data;
}

/**
 * Registers an ipcMain handler that automatically logs errors with a
 * [ipc:<channel>] prefix and rethrows them. Eliminates the try/catch/log/rethrow
 * boilerplate from individual handlers.
 *
 * Pass `{ schema }` to validate the renderer payload before the handler runs.
 */
export function handle<Args extends unknown[], R>(
  channel: string,
  handler: Handler<Args, R>,
  options?: HandleOptions<Args>
): void {
  const schema = options?.schema;
  ipcMain.handle(channel, async (event, ...args) => {
    const parsedArgs = schema ? validateOrThrow(channel, schema, args) : (args as Args);
    try {
      return await handler(event, ...parsedArgs);
    } catch (err) {
      logger.error(`[ipc:${channel}]`, err);
      Sentry.captureException(err);
      throw err;
    }
  });
}

/**
 * Like handle(), but calls fallback(err) instead of throwing when the handler
 * errors. Use for channels that legitimately return a degraded default on failure.
 *
 * Validation errors (`IpcError('BAD_REQUEST', …)`) are NOT routed through
 * `fallback` — they rethrow directly. The fallback is intended for degraded
 * upstream, not for tampered input.
 */
export function handleWithFallback<Args extends unknown[], R>(
  channel: string,
  handler: Handler<Args, R>,
  fallback: (err: unknown) => R,
  options?: HandleOptions<Args>
): void {
  const schema = options?.schema;
  ipcMain.handle(channel, async (event, ...args) => {
    let parsedArgs: Args;
    if (schema) {
      // validateOrThrow throws IpcError BAD_REQUEST — bypass the fallback path
      // so tampered input cannot masquerade as a degraded upstream response.
      parsedArgs = validateOrThrow(channel, schema, args);
    } else {
      parsedArgs = args as Args;
    }

    try {
      return await handler(event, ...parsedArgs);
    } catch (err) {
      logger.warn(`[ipc:${channel}] using fallback`, err);
      Sentry.captureException(err);
      return fallback(err);
    }
  });
}
