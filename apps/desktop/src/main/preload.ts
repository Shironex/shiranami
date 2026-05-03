import { contextBridge, ipcRenderer } from 'electron';
import {
  isIpcError,
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from './ipc/errors';
import { appApi, type AppApi } from './preload/api/app';
import { dbApi, type DbApi } from './preload/api/db';
import { dialogApi, type DialogApi } from './preload/api/dialog';
import { downloaderApi, type DownloaderApi } from './preload/api/downloader';
import { libraryApi, type LibraryApi } from './preload/api/library';
import { lyricsApi, type LyricsApi } from './preload/api/lyrics';
import { mediaApi, type MediaApi } from './preload/api/media';
import { metadataApi, type MetadataApi } from './preload/api/metadata';
import { playlistApi, type PlaylistApi } from './preload/api/playlist';
import { radioApi, type RadioApi } from './preload/api/radio';
import { shareApi, type ShareApi } from './preload/api/share';
import { shellApi, type ShellApi } from './preload/api/shell';
import { storeApi, type StoreApi } from './preload/api/store';
import { updaterApi, type UpdaterApi } from './preload/api/updater';
import { windowApi, type WindowApi } from './preload/api/window';

const UPDATER_IPC_CHANNELS = new Set([
  'updater:check-for-updates',
  'updater:start-download',
  'updater:install-now',
]);

const ALLOWED_IPC_CHANNELS = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',
  'window:set-always-on-top',
  'window:set-compact-mode',
  'media:playback-state',
  'media:clear-state',
  'store:get',
  'store:set',
  'store:delete',
  'app:get-version',
  'app:open-logs-folder',
  'dialog:open-directory',
  'dialog:open-file',
  'library:parse-metadata',
  'library:scan-folder',
  'library:scan-folder-grouped',
  'library:validate-files',
  'lyrics:fetch',
  'db:tracks:get-all',
  'db:tracks:add',
  'db:tracks:add-many',
  'db:tracks:remove',
  'db:tracks:remove-many',
  'db:tracks:update',
  'db:tracks:update-many',
  'db:tracks:toggle-favorite',
  'db:tracks:get-favorites',
  'db:tracks:increment-play-count',
  'db:tracks:exists',
  'db:tracks:exists-many',
  'db:history:record-play',
  'db:history:get-recent',
  'db:history:get-summary',
  'db:history:get-activity',
  'db:folders:get-all',
  'db:folders:add',
  'db:folders:remove',
  'db:folders:update-scanned',
  'db:playlists:get-all',
  'db:playlists:get',
  'db:playlists:create',
  'db:playlists:create-with-tracks',
  'db:playlists:update',
  'db:playlists:delete',
  'db:playlists:get-tracks',
  'db:playlists:add-track',
  'db:playlists:remove-track',
  'db:playlists:get-playlists-for-tracks',
  'db:playlists:reorder',
  'shell:show-in-folder',
  'shell:trash-file',
  'downloader:check',
  'downloader:get-download-location',
  'downloader:set-download-location',
  'downloader:check-dependencies',
  'downloader:search',
  'downloader:suggest',
  'downloader:download',
  'downloader:install-ytdlp',
  'downloader:get-ytdlp-path',
  'downloader:check-ffmpeg',
  'downloader:install-ffmpeg',
  'downloader:get-stream-url',
  'downloader:install-dependencies',
  'radio:favorites:get-all',
  'radio:favorites:add',
  'radio:favorites:remove',
  'radio:favorites:is-favorite',
  'playlist:extract',
  'playlist:cancel',
  'share:track',
  'share:playlist',
  'share:import',
  'share:cache-youtube-id',
  'metadata:lookup',
  'metadata:enrich:tracks',
  'metadata:enrich:cancel',
]);

function assertAllowedChannel(channel: string): void {
  if (!ALLOWED_IPC_CHANNELS.has(channel) && !UPDATER_IPC_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: "${channel}"`);
  }
}

function invokeWithTimeout<T>(channel: string, timeout: number, ...args: unknown[]): Promise<T> {
  assertAllowedChannel(channel);
  const invokePromise = ipcRenderer.invoke(channel, ...args) as Promise<T>;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`IPC timeout: "${channel}" did not respond within ${timeout}ms`));
      invokePromise.catch(() => {});
    }, timeout);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  });
  return Promise.race([invokePromise.finally(() => clearTimeout(timer)), timeoutPromise]);
}

export interface ElectronAPI {
  window: WindowApi;
  store: StoreApi;
  dialog: DialogApi;
  app: AppApi;
  library: LibraryApi;
  db: DbApi;
  lyrics: LyricsApi;
  media: MediaApi;
  downloader: DownloaderApi;
  updater: UpdaterApi;
  shell: ShellApi;
  radio: RadioApi;
  playlist: PlaylistApi;
  metadata: MetadataApi;
  share: ShareApi;
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) => Promise<T>;
  };
  errors: {
    isIpcError: (e: unknown) => e is { code: string; message: string; details?: unknown };
    SHARE_ERROR_CODES: typeof SHARE_ERROR_CODES;
    PLAYLIST_ERROR_CODES: typeof PLAYLIST_ERROR_CODES;
    VALIDATION_ERROR_CODES: typeof VALIDATION_ERROR_CODES;
  };
  platform: NodeJS.Platform;
}

const electronAPI: ElectronAPI = {
  window: windowApi,
  store: storeApi,
  dialog: dialogApi,
  app: appApi,
  library: libraryApi,
  db: dbApi,
  lyrics: lyricsApi,
  media: mediaApi,
  downloader: downloaderApi,
  updater: updaterApi,
  shell: shellApi,
  radio: radioApi,
  playlist: playlistApi,
  metadata: metadataApi,
  share: shareApi,
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) =>
      invokeWithTimeout<T>(channel, timeout, ...args),
  },
  errors: {
    isIpcError,
    SHARE_ERROR_CODES,
    PLAYLIST_ERROR_CODES,
    VALIDATION_ERROR_CODES,
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
