// Electron preload entry point. Composes the per-namespace API modules into
// the renderer-facing `window.electronAPI` shape and exposes it via Electron's
// contextBridge. Channel allowlisting is centralized in ./context-bridge.ts and
// derives from the `@shiranami/contracts` IPC manifest, so the security
// surface tracks the manifest mechanically.

import { contextBridge } from 'electron';
import {
  isIpcError,
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '../ipc/errors';
import { invokeWithTimeout } from './context-bridge';
import { appApi, type AppApi } from './api/app';
import { dbApi, type DbApi } from './api/db';
import { dialogApi, type DialogApi } from './api/dialog';
import { downloaderApi, type DownloaderApi } from './api/downloader';
import { libraryApi, type LibraryApi } from './api/library';
import { lyricsApi, type LyricsApi } from './api/lyrics';
import { mediaApi, type MediaApi } from './api/media';
import { metadataApi, type MetadataApi } from './api/metadata';
import { playlistApi, type PlaylistApi } from './api/playlist';
import { radioApi, type RadioApi } from './api/radio';
import { shareApi, type ShareApi } from './api/share';
import { shellApi, type ShellApi } from './api/shell';
import { storeApi, type StoreApi } from './api/store';
import { updaterApi, type UpdaterApi } from './api/updater';
import { windowApi, type WindowApi } from './api/window';

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
