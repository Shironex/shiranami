import { ipcRenderer } from 'electron';
import { ALL_IPC_CHANNELS } from '@shiranami/contracts';

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
 */
export const ALLOWED_IPC_CHANNELS: ReadonlySet<string> = new Set(ALL_IPC_CHANNELS);

export function assertAllowedChannel(channel: string): void {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: "${channel}"`);
  }
}

/**
 * Calls `ipcRenderer.invoke` with an enforced timeout. Rejects if the channel
 * is not on the allowlist (synchronously, before any IPC traffic) or if the
 * main-process handler does not respond within `timeoutMs`.
 */
export function invokeWithTimeout<T>(
  channel: string,
  timeoutMs: number,
  ...args: unknown[]
): Promise<T> {
  assertAllowedChannel(channel);
  const invokePromise = ipcRenderer.invoke(channel, ...args) as Promise<T>;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`IPC timeout: "${channel}" did not respond within ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer === 'object' && 'unref' in timer) {
      (timer as NodeJS.Timeout).unref();
    }
    invokePromise.then(
      result => {
        clearTimeout(timer);
        resolve(result);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
