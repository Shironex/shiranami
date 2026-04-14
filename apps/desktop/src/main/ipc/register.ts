/**
 * IPC handler registration.
 *
 * Error-handling contract (resolves #70):
 *  - Handlers THROW on failure. ipcMain.handle propagates thrown errors as a
 *    rejected promise on the renderer — no { success, error } envelope.
 *  - Use `IpcError(code, message)` from `./errors` for any failure the renderer
 *    needs to discriminate or translate. `code` is a stable machine-readable key.
 *  - Wrap every handler with `handle()` from `./with-ipc-handler` — it logs
 *    [ipc:<channel>] automatically; do not write try/catch/log/rethrow by hand.
 *  - Handlers with a legitimate degraded fallback use `handleWithFallback()`.
 *  - Renderer error classification: `isIpcError(e)` + code registries
 *    (YT_DLP_ERROR_CODES, SHARE_ERROR_CODES, PLAYLIST_ERROR_CODES), all
 *    re-exported through the preload.
 *
 * Channel naming convention (resolves #75):
 *  - Default shape is two-segment: `<namespace>:<action-name>`
 *    (e.g. `library:scan-folder`, `window:set-compact-mode`).
 *  - Three-segment `<namespace>:<entity>:<action>` is allowed — and preferred —
 *    when 2+ channels share a sub-feature:
 *      db:tracks:*, db:history:*, db:folders:*, db:playlists:*
 *      radio:favorites:*
 *      metadata:enrich:*
 *  - Do NOT flatten sub-namespaces with a hyphen (e.g. `metadata:enrich-tracks`);
 *    use a third colon segment instead.
 *  - Logger prefixes should mirror the channel namespace (e.g. `[metadata:enrich]`
 *    for handlers in the `metadata:enrich:*` sub-feature). Auto-error logs from
 *    `handle()` emit `[ipc:<full-channel>]`; informational logs use the bare
 *    `[<namespace>]` or `[<namespace>:<entity>]` form.
 */
import { BrowserWindow } from 'electron';
import {
  registerWindowHandlers,
  cleanupWindowHandlers,
  registerStoreHandlers,
  cleanupStoreHandlers,
  registerAppHandlers,
  cleanupAppHandlers,
  registerDialogHandlers,
  cleanupDialogHandlers,
  registerLibraryHandlers,
  cleanupLibraryHandlers,
  registerMediaHandlers,
  cleanupMediaHandlers,
  registerLyricsHandlers,
  cleanupLyricsHandlers,
  registerDatabaseHandlers,
  cleanupDatabaseHandlers,
  registerShellHandlers,
  cleanupShellHandlers,
  registerDownloaderHandlers,
  cleanupDownloaderHandlers,
  registerUpdaterHandlers,
  cleanupUpdaterHandlers,
  registerRadioHandlers,
  cleanupRadioHandlers,
  registerPlaylistHandlers,
  cleanupPlaylistHandlers,
  registerShareHandlers,
  cleanupShareHandlers,
  registerMetadataEnrichHandlers,
  cleanupMetadataEnrichHandlers,
} from './';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerWindowHandlers(mainWindow);
  registerStoreHandlers();
  registerAppHandlers();
  registerDialogHandlers(mainWindow);
  registerLibraryHandlers();
  registerMediaHandlers();
  registerLyricsHandlers();
  registerDatabaseHandlers();
  registerShellHandlers();
  registerDownloaderHandlers();
  registerUpdaterHandlers();
  registerRadioHandlers();
  registerPlaylistHandlers();
  registerShareHandlers();
  registerMetadataEnrichHandlers();
}

export function cleanupIpcHandlers(): void {
  cleanupWindowHandlers();
  cleanupStoreHandlers();
  cleanupAppHandlers();
  cleanupDialogHandlers();
  cleanupLibraryHandlers();
  cleanupMediaHandlers();
  cleanupLyricsHandlers();
  cleanupDatabaseHandlers();
  cleanupShellHandlers();
  cleanupDownloaderHandlers();
  cleanupUpdaterHandlers();
  cleanupRadioHandlers();
  cleanupPlaylistHandlers();
  cleanupShareHandlers();
  cleanupMetadataEnrichHandlers();
}
