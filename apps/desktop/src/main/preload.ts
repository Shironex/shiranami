import { contextBridge, ipcRenderer } from 'electron';
import {
  isIpcError,
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from './ipc/errors';
import { createIpcListener } from './preload/ipc-listener';
import { appApi, type AppApi } from './preload/api/app';
import { dbApi, type DbApi } from './preload/api/db';
import { dialogApi, type DialogApi } from './preload/api/dialog';
import { downloaderApi, type DownloaderApi } from './preload/api/downloader';
import { libraryApi, type LibraryApi } from './preload/api/library';
import { lyricsApi, type LyricsApi } from './preload/api/lyrics';
import { mediaApi, type MediaApi } from './preload/api/media';
import { shellApi, type ShellApi } from './preload/api/shell';
import { storeApi, type StoreApi } from './preload/api/store';
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
  updater: {
    checkForUpdates: () => Promise<{ enabled: boolean }>;
    startDownload: () => Promise<void>;
    installNow: () => Promise<void>;
    onCheckingForUpdate: (callback: () => void) => () => void;
    onUpdateAvailable: (
      callback: (info: {
        version: string;
        releaseNotes: string | null;
        releaseDate: string;
      }) => void
    ) => () => void;
    onUpdateNotAvailable: (callback: () => void) => () => void;
    onDownloadProgress: (
      callback: (progress: {
        bytesPerSecond: number;
        percent: number;
        transferred: number;
        total: number;
      }) => void
    ) => () => void;
    onUpdateDownloaded: (
      callback: (info: {
        version: string;
        releaseNotes: string | null;
        releaseDate: string;
      }) => void
    ) => () => void;
    onUpdateError: (callback: (message: string) => void) => () => void;
  };
  shell: ShellApi;
  radio: {
    favorites: {
      getAll: () => Promise<unknown[]>;
      add: (station: {
        stationUuid: string;
        name: string;
        url: string;
        urlResolved: string;
        homepage?: string;
        favicon?: string;
        country?: string;
        countryCode?: string;
        language?: string;
        codec?: string;
        bitrate?: number;
        tags?: string;
      }) => Promise<unknown>;
      remove: (stationUuid: string) => Promise<void>;
      isFavorite: (stationUuid: string) => Promise<boolean>;
    };
  };
  playlist: {
    extract: (url: string) => Promise<
      Array<{
        id: string;
        title: string;
        uploader: string;
        duration: number;
        thumbnail: string;
        url: string;
        webpage_url: string;
      }>
    >;
    cancel: () => Promise<void>;
    onExtractProgress: (
      callback: (data: { current: number; total: number; trackName: string }) => void
    ) => () => void;
  };
  metadata: {
    lookup: (
      title: string,
      artist: string
    ) => Promise<{
      title?: string;
      artist?: string;
      album?: string;
      genre?: string;
      year?: number;
      trackNumber?: number;
      coverImageUrl?: string;
      source: 'itunes' | 'youtube' | 'none';
      confidence: number;
    }>;
    enrichTracks: (
      tracks: Array<{
        id: string;
        filePath: string;
        title: string;
        artist: string;
        album: string;
        albumArt: string | null;
        genre: string;
        year: number | null;
        trackNumber: number | null;
      }>,
      options: { writeToFile: boolean; onlyMissing: boolean }
    ) => Promise<
      Array<{
        id: string;
        success: boolean;
        updatedFields: Partial<{
          title: string;
          artist: string;
          album: string;
          genre: string;
          year: number;
          trackNumber: number;
          albumArt: string;
        }>;
        source: string;
        error?: string;
      }>
    >;
    cancelEnrichment: () => Promise<void>;
    onEnrichProgress: (
      callback: (data: {
        current: number;
        total: number;
        trackName: string;
        status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
      }) => void
    ) => () => void;
  };
  share: {
    track: (trackId: string) => Promise<{ code: string; url: string; expiresAt: string }>;
    playlist: (playlistId: string) => Promise<{ code: string; url: string; expiresAt: string }>;
    import: (code: string) => Promise<{
      type: 'TRACK' | 'PLAYLIST';
      payload: unknown;
      code: string;
      expiresAt: string;
    }>;
    cacheYoutubeId: (trackId: string, youtubeId: string) => Promise<void>;
    onDeepLink: (callback: (code: string) => void) => () => void;
  };
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
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    installNow: () => ipcRenderer.invoke('updater:install-now'),
    onCheckingForUpdate: createIpcListener<void>('updater:checking-for-update'),
    onUpdateAvailable: createIpcListener<{
      version: string;
      releaseNotes: string | null;
      releaseDate: string;
    }>('updater:update-available'),
    onUpdateNotAvailable: createIpcListener<void>('updater:update-not-available'),
    onDownloadProgress: createIpcListener<{
      bytesPerSecond: number;
      percent: number;
      transferred: number;
      total: number;
    }>('updater:download-progress'),
    onUpdateDownloaded: createIpcListener<{
      version: string;
      releaseNotes: string | null;
      releaseDate: string;
    }>('updater:update-downloaded'),
    onUpdateError: createIpcListener<string>('updater:error'),
  },
  shell: shellApi,
  radio: {
    favorites: {
      getAll: () => ipcRenderer.invoke('radio:favorites:get-all'),
      add: (station: {
        stationUuid: string;
        name: string;
        url: string;
        urlResolved: string;
        homepage?: string;
        favicon?: string;
        country?: string;
        countryCode?: string;
        language?: string;
        codec?: string;
        bitrate?: number;
        tags?: string;
      }) => ipcRenderer.invoke('radio:favorites:add', station),
      remove: (stationUuid: string) => ipcRenderer.invoke('radio:favorites:remove', stationUuid),
      isFavorite: (stationUuid: string) =>
        ipcRenderer.invoke('radio:favorites:is-favorite', stationUuid) as Promise<boolean>,
    },
  },
  playlist: {
    extract: (url: string) => ipcRenderer.invoke('playlist:extract', url),
    cancel: () => ipcRenderer.invoke('playlist:cancel'),
    onExtractProgress: createIpcListener<{
      current: number;
      total: number;
      trackName: string;
    }>('playlist:extract-progress'),
  },
  metadata: {
    lookup: (title: string, artist: string) => ipcRenderer.invoke('metadata:lookup', title, artist),
    enrichTracks: (
      tracks: Array<{
        id: string;
        filePath: string;
        title: string;
        artist: string;
        album: string;
        albumArt: string | null;
        genre: string;
        year: number | null;
        trackNumber: number | null;
      }>,
      options: { writeToFile: boolean; onlyMissing: boolean }
    ) => ipcRenderer.invoke('metadata:enrich:tracks', tracks, options),
    cancelEnrichment: () => ipcRenderer.invoke('metadata:enrich:cancel'),
    onEnrichProgress: createIpcListener<{
      current: number;
      total: number;
      trackName: string;
      status: 'searching' | 'downloading' | 'writing' | 'done' | 'error' | 'cancelled';
    }>('metadata:enrich:progress'),
  },
  share: {
    track: (trackId: string) => ipcRenderer.invoke('share:track', trackId),
    playlist: (playlistId: string) => ipcRenderer.invoke('share:playlist', playlistId),
    import: (code: string) => ipcRenderer.invoke('share:import', code),
    cacheYoutubeId: (trackId: string, youtubeId: string) =>
      ipcRenderer.invoke('share:cache-youtube-id', trackId, youtubeId),
    onDeepLink: createIpcListener<string>('share:deep-link'),
  },
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
