import { contextBridge, ipcRenderer } from 'electron';
import {
  isIpcError,
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from './ipc/errors';
import type { InstallDependenciesResult } from './ipc/downloader';
import { createIpcListener } from './preload/ipc-listener';
import { appApi, type AppApi } from './preload/api/app';
import { dialogApi, type DialogApi } from './preload/api/dialog';
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

import type {
  ListeningActivityPoint,
  ListeningHistoryEntry,
  ListeningStatsSummary,
} from './preload/types';

export interface ElectronAPI {
  window: WindowApi;
  store: StoreApi;
  dialog: DialogApi;
  app: AppApi;
  library: LibraryApi;
  db: {
    tracks: {
      getAll: () => Promise<unknown[]>;
      add: (track: unknown) => Promise<unknown>;
      addMany: (tracks: unknown[]) => Promise<unknown[]>;
      remove: (id: string) => Promise<void>;
      removeMany: (ids: string[]) => Promise<void>;
      update: (id: string, data: unknown) => Promise<unknown>;
      updateMany: (updates: Array<{ id: string; data: unknown }>) => Promise<unknown[]>;
      toggleFavorite: (id: string) => Promise<unknown>;
      getFavorites: () => Promise<unknown[]>;
      incrementPlayCount: (id: string) => Promise<unknown>;
      exists: (filePath: string) => Promise<boolean>;
      existsMany: (filePaths: string[]) => Promise<string[]>;
    };
    history: {
      recordPlay: (data: {
        trackId: string;
        playedSeconds: number;
        duration: number | null;
        source?: string;
      }) => Promise<unknown>;
      getRecent: (options?: {
        limit?: number;
        since?: string | null;
      }) => Promise<ListeningHistoryEntry[]>;
      getSummary: (options?: { since?: string | null }) => Promise<ListeningStatsSummary>;
      getActivity: (options?: { since?: string | null }) => Promise<ListeningActivityPoint[]>;
    };
    folders: {
      getAll: () => Promise<unknown[]>;
      add: (path: string) => Promise<unknown>;
      remove: (id: string) => Promise<void>;
      updateScanned: (id: string) => Promise<unknown>;
    };
    playlists: {
      getAll: () => Promise<unknown[]>;
      get: (id: string) => Promise<unknown>;
      create: (data: { name: string; description?: string; coverArt?: string }) => Promise<unknown>;
      createWithTracks: (data: {
        name: string;
        description?: string;
        trackIds: string[];
      }) => Promise<unknown>;
      update: (
        id: string,
        data: { name?: string; description?: string; coverArt?: string }
      ) => Promise<unknown>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<unknown[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
      getPlaylistsForTracks: (trackIds: string[]) => Promise<string[]>;
      reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
    };
  };
  lyrics: LyricsApi;
  media: MediaApi;
  downloader: {
    getStreamUrl: (url: string) => Promise<string>;
    suggest: (query: string) => Promise<string[]>;
    search: (query: string) => Promise<
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
    download: (url: string) => Promise<string>;
    getDownloadLocation: () => Promise<{
      path: string;
      defaultPath: string;
      isDefault: boolean;
    }>;
    setDownloadLocation: (path: string | null) => Promise<{
      path: string;
      defaultPath: string;
      isDefault: boolean;
    }>;
    checkDependencies: () => Promise<{ ytdlpInstalled: boolean; ffmpegInstalled: boolean }>;
    getCachedToolStatus: () => Promise<{
      ytdlp: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ffmpeg: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ytdlpPath: string;
      downloadLocation: { path: string; defaultPath: string; isDefault: boolean };
      timestamp: number;
    } | null>;
    refreshToolStatus: () => Promise<{
      ytdlp: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ffmpeg: {
        installed: boolean;
        version?: string;
        latestVersion?: string;
        updateAvailable?: boolean;
      };
      ytdlpPath: string;
      downloadLocation: { path: string; defaultPath: string; isDefault: boolean };
      timestamp: number;
    } | null>;
    check: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    onProgress: (
      callback: (data: {
        url: string;
        progress: number;
        status: 'downloading' | 'converting' | 'done' | 'error';
        error?: string;
      }) => void
    ) => () => void;
    installYtDlp: () => Promise<void>;
    onInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    getYtDlpPath: () => Promise<string>;
    checkFfmpeg: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    installFfmpeg: () => Promise<void>;
    onFfmpegInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    installDependencies: () => Promise<InstallDependenciesResult>;
    onDependencyInstallProgress: (
      callback: (progress: {
        target: 'ytdlp' | 'ffmpeg';
        percent: number;
        overallPercent: number;
        label: string;
      }) => void
    ) => () => void;
  };
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
  db: {
    tracks: {
      getAll: () => ipcRenderer.invoke('db:tracks:get-all'),
      add: (track: unknown) => ipcRenderer.invoke('db:tracks:add', track),
      addMany: (tracks: unknown[]) => ipcRenderer.invoke('db:tracks:add-many', tracks),
      remove: (id: string) => ipcRenderer.invoke('db:tracks:remove', id),
      removeMany: (ids: string[]) => ipcRenderer.invoke('db:tracks:remove-many', ids),
      update: (id: string, data: unknown) => ipcRenderer.invoke('db:tracks:update', id, data),
      updateMany: (updates: Array<{ id: string; data: unknown }>) =>
        ipcRenderer.invoke('db:tracks:update-many', updates),
      toggleFavorite: (id: string) => ipcRenderer.invoke('db:tracks:toggle-favorite', id),
      getFavorites: () => ipcRenderer.invoke('db:tracks:get-favorites'),
      incrementPlayCount: (id: string) => ipcRenderer.invoke('db:tracks:increment-play-count', id),
      exists: (filePath: string) => ipcRenderer.invoke('db:tracks:exists', filePath),
      existsMany: (filePaths: string[]) =>
        ipcRenderer.invoke('db:tracks:exists-many', filePaths) as Promise<string[]>,
    },
    history: {
      recordPlay: (data: {
        trackId: string;
        playedSeconds: number;
        duration: number | null;
        source?: string;
      }) => ipcRenderer.invoke('db:history:record-play', data),
      getRecent: (options?: { limit?: number; since?: string | null }) =>
        ipcRenderer.invoke('db:history:get-recent', options),
      getSummary: (options?: { since?: string | null }) =>
        ipcRenderer.invoke('db:history:get-summary', options),
      getActivity: (options?: { since?: string | null }) =>
        ipcRenderer.invoke('db:history:get-activity', options),
    },
    folders: {
      getAll: () => ipcRenderer.invoke('db:folders:get-all'),
      add: (path: string) => ipcRenderer.invoke('db:folders:add', path),
      remove: (id: string) => ipcRenderer.invoke('db:folders:remove', id),
      updateScanned: (id: string) => ipcRenderer.invoke('db:folders:update-scanned', id),
    },
    playlists: {
      getAll: () => ipcRenderer.invoke('db:playlists:get-all'),
      get: (id: string) => ipcRenderer.invoke('db:playlists:get', id),
      create: (data: { name: string; description?: string; coverArt?: string }) =>
        ipcRenderer.invoke('db:playlists:create', data),
      createWithTracks: (data: { name: string; description?: string; trackIds: string[] }) =>
        ipcRenderer.invoke('db:playlists:create-with-tracks', data),
      update: (id: string, data: { name?: string; description?: string; coverArt?: string }) =>
        ipcRenderer.invoke('db:playlists:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('db:playlists:delete', id),
      getTracks: (playlistId: string) => ipcRenderer.invoke('db:playlists:get-tracks', playlistId),
      addTrack: (playlistId: string, trackId: string) =>
        ipcRenderer.invoke('db:playlists:add-track', { playlistId, trackId }),
      removeTrack: (playlistId: string, trackId: string) =>
        ipcRenderer.invoke('db:playlists:remove-track', { playlistId, trackId }),
      getPlaylistsForTracks: (trackIds: string[]) =>
        ipcRenderer.invoke('db:playlists:get-playlists-for-tracks', trackIds),
      reorder: (playlistId: string, trackIds: string[]) =>
        ipcRenderer.invoke('db:playlists:reorder', { playlistId, trackIds }),
    },
  },
  lyrics: lyricsApi,
  media: mediaApi,
  downloader: {
    suggest: (query: string) => ipcRenderer.invoke('downloader:suggest', query),
    search: (query: string) => ipcRenderer.invoke('downloader:search', query),
    getStreamUrl: (url: string) => ipcRenderer.invoke('downloader:get-stream-url', url),
    download: (url: string) => ipcRenderer.invoke('downloader:download', { url }),
    getDownloadLocation: () => ipcRenderer.invoke('downloader:get-download-location'),
    setDownloadLocation: (downloadPath: string | null) =>
      ipcRenderer.invoke('downloader:set-download-location', downloadPath),
    checkDependencies: () => ipcRenderer.invoke('downloader:check-dependencies'),
    getCachedToolStatus: () => ipcRenderer.invoke('downloader:get-cached-tool-status'),
    refreshToolStatus: () => ipcRenderer.invoke('downloader:refresh-tool-status'),
    check: () => ipcRenderer.invoke('downloader:check'),
    onProgress: createIpcListener<{
      url: string;
      progress: number;
      status: 'downloading' | 'converting' | 'done' | 'error';
      error?: string;
    }>('downloader:progress'),
    installYtDlp: () => ipcRenderer.invoke('downloader:install-ytdlp'),
    onInstallProgress: createIpcListener<{ percent: number }>('downloader:install-progress'),
    getYtDlpPath: () => ipcRenderer.invoke('downloader:get-ytdlp-path'),
    checkFfmpeg: () => ipcRenderer.invoke('downloader:check-ffmpeg'),
    installFfmpeg: () => ipcRenderer.invoke('downloader:install-ffmpeg'),
    onFfmpegInstallProgress: createIpcListener<{ percent: number }>(
      'downloader:ffmpeg-install-progress'
    ),
    installDependencies: () => ipcRenderer.invoke('downloader:install-dependencies'),
    onDependencyInstallProgress: createIpcListener<{
      target: 'ytdlp' | 'ffmpeg';
      percent: number;
      overallPercent: number;
      label: string;
    }>('downloader:dependency-install-progress'),
  },
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
