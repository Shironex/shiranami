import { ipcRenderer } from 'electron';
import { ALL_IPC_CHANNELS } from '@shiranami/contracts';
import { decodeIpcError } from '../ipc/errors';

/**
 * Allowlist of every IPC channel the renderer is permitted to invoke. Derived
 * from the `@shiranami/contracts` manifest (`ALL_IPC_CHANNELS`) so adding a
 * channel to the manifest automatically extends the allowlist — there is no
 * second list to keep in sync.
 *
 * The previous hand-maintained set drifted: 7 channels were exposed but missing
 * from the allowlist (`downloader:get-cached-tool-status`,
 * `downloader:refresh-tool-status`, `media:command`, `share:deep-link`, and all
 * 6 `updater:*` channels), making `assertAllowedChannel` decorative for those.
 * Sourcing from the manifest closes that gap.
 *
 * NOTE: this allowlist is defense-in-depth on the trusted preload side. It does
 * not gate the renderer directly — the renderer can only reach IPC through the
 * `invoke` wrapper below, which every api/* module routes through.
 */
export const ALLOWED_IPC_CHANNELS: ReadonlySet<string> = new Set(ALL_IPC_CHANNELS);

export function assertAllowedChannel(channel: string): void {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: "${channel}"`);
  }
}

/**
 * Re-pack a serialized rejection into a proper error object.
 *
 * Electron's `invoke` rejects with a plain Error whose message is
 * `Error invoking remote method '<ch>': <name>: <message>`. For handlers that
 * threw an `IpcError`, the message carries a sentinel-encoded payload (see
 * `encodeIpcError`): we decode it and return an error carrying the original
 * `code`/`message`/`details` so the renderer's `isIpcError` works and consumers
 * see the handler's clean message (no `Error invoking remote method` prefix).
 *
 * For non-IpcError rejections we still strip Electron's wrapper prefix so the
 * surfaced `message` is the handler's own text.
 */
function rehydrateInvokeError(raw: unknown): unknown {
  if (!(raw instanceof Error)) return raw;

  const structured = decodeIpcError(raw.message);
  if (structured) {
    const error = new Error(structured.message) as Error & { code: string; details?: unknown };
    error.name = 'IpcError';
    error.code = structured.code;
    if (structured.details !== undefined) error.details = structured.details;
    return error;
  }

  // Strip the `Error invoking remote method '<ch>': ` wrapper (and the leading
  // `<Name>: ` error-name token Electron appends after it) so the surfaced
  // message is the handler's own text rather than the transport envelope.
  const stripped = raw.message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:[A-Za-z_$][\w$]*)?Error:\s*/, '');
  if (stripped !== raw.message) raw.message = stripped;
  return raw;
}

/**
 * The single entry point every preload api/* module uses to call the main
 * process. Enforces the channel allowlist (synchronously, before any IPC
 * traffic) and rehydrates rejected errors so structured `IpcError`s survive the
 * bridge. No timeout: invokes here include long-running operations (library
 * scans, downloads, metadata enrichment) for which a blanket timeout would
 * spuriously reject in-flight work.
 */
export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  assertAllowedChannel(channel);
  return (ipcRenderer.invoke(channel, ...args) as Promise<T>).catch(err => {
    throw rehydrateInvokeError(err);
  });
}
