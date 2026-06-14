import { ipcMain } from 'electron';
import * as Sentry from '@sentry/electron/main';
import type { ZodType } from 'zod';
import { logger } from '../app/logger';
import { IpcError, encodeIpcError } from './errors';

/**
 * Electron's `invoke` serializes only an error's `name`/`message` across the
 * IPC bridge, so an `IpcError`'s `code`/`details` would be lost. Re-pack an
 * IpcError as a plain Error whose message carries the sentinel-encoded payload;
 * the preload `invoke` wrapper rehydrates it renderer-side. Non-IpcError
 * rejections pass through unchanged.
 */
function toTransportError(err: unknown): unknown {
  if (err instanceof IpcError) {
    return new Error(encodeIpcError(err));
  }
  return err;
}

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
 * `IpcError('BAD_REQUEST', …, issues)`. That IpcError (like any thrown from a
 * handler) is sentinel-encoded on rethrow via `toTransportError` because
 * Electron's `invoke` otherwise drops the `code`/`details` fields; the preload
 * `invoke` wrapper rehydrates the structured error renderer-side. Validation
 * errors bypass `handleWithFallback`'s fallback path: fallbacks exist for
 * degraded upstream, not for tampered input.
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
    try {
      const parsedArgs = schema ? validateOrThrow(channel, schema, args) : (args as Args);
      return await handler(event, ...parsedArgs);
    } catch (err) {
      logger.error(`[ipc:${channel}]`, err);
      // IpcErrors are deliberate, user-meaningful failures (validation, busy
      // states) — only report unexpected errors to Sentry.
      if (!(err instanceof IpcError)) {
        Sentry.captureException(err);
      }
      // Encode IpcError so its code/details survive the IPC bridge; the preload
      // invoke wrapper rehydrates the structured error renderer-side.
      throw toTransportError(err);
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
      // Encode it so its code/details still reach the renderer.
      try {
        parsedArgs = validateOrThrow(channel, schema, args);
      } catch (err) {
        throw toTransportError(err);
      }
    } else {
      parsedArgs = args as Args;
    }

    try {
      return await handler(event, ...parsedArgs);
    } catch (err) {
      // Fallback channels degrade gracefully by design (Discord RPC offline,
      // network fetch timeout) — these are expected failures, so don't report
      // them to Sentry; the warn log is enough.
      logger.warn(`[ipc:${channel}] using fallback`, err);
      return fallback(err);
    }
  });
}
