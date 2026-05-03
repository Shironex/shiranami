import { contextBridge } from 'electron';
import {
  isIpcError,
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from './ipc/errors';
import { invokeWithTimeout } from './preload/context-bridge';
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
