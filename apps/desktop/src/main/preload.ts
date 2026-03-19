import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function createIpcListener<T>(channel: string): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void) => {
    const handler = (_event: IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

const ALLOWED_IPC_CHANNELS = new Set([
  'window:is-maximized',
  'store:get',
  'store:set',
  'store:delete',
  'app:get-version',
  'dialog:open-directory',
  'dialog:open-file',
  'library:parse-metadata',
  'library:parse-files',
  'library:scan-folder',
  'lyrics:fetch',
  'db:tracks:get-all',
  'db:tracks:add',
  'db:tracks:add-many',
  'db:tracks:remove',
  'db:tracks:remove-many',
  'db:tracks:update',
  'db:tracks:toggle-favorite',
  'db:tracks:get-favorites',
  'db:tracks:increment-play-count',
  'db:tracks:exists',
  'db:folders:get-all',
  'db:folders:add',
  'db:folders:remove',
  'db:folders:update-scanned',
  'db:playlists:get-all',
  'db:playlists:get',
  'db:playlists:create',
  'db:playlists:update',
  'db:playlists:delete',
  'db:playlists:get-tracks',
  'db:playlists:add-track',
  'db:playlists:remove-track',
  'db:playlists:reorder',
  'shell:show-in-folder',
  'downloader:check',
  'downloader:get-download-location',
  'downloader:set-download-location',
  'downloader:check-dependencies',
  'downloader:search',
  'downloader:download',
  'downloader:install-ytdlp',
  'downloader:get-ytdlp-path',
  'downloader:check-ffmpeg',
  'downloader:install-ffmpeg',
  'downloader:install-dependencies',
]);

function assertAllowedChannel(channel: string): void {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
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

interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number | null;
  trackNumber: number | null;
  albumArt: string | null;
}

export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  };
  store: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
    openFile: (options?: unknown) => Promise<string | null>;
  };
  app: {
    getVersion: () => Promise<string>;
  };
  library: {
    parseMetadata: (filePath: string) => Promise<{ filePath: string; metadata: TrackMetadata }>;
    parseFiles: (filePaths: string[]) => Promise<Array<{ filePath: string; metadata: TrackMetadata }>>;
    scanFolder: (dirPath: string) => Promise<Array<{ filePath: string; metadata: TrackMetadata }>>;
  };
  db: {
    tracks: {
      getAll: () => Promise<unknown[]>;
      add: (track: unknown) => Promise<unknown>;
      addMany: (tracks: unknown[]) => Promise<unknown[]>;
      remove: (id: string) => Promise<void>;
      removeMany: (ids: string[]) => Promise<void>;
      update: (id: string, data: unknown) => Promise<unknown>;
      toggleFavorite: (id: string) => Promise<unknown>;
      getFavorites: () => Promise<unknown[]>;
      incrementPlayCount: (id: string) => Promise<unknown>;
      exists: (filePath: string) => Promise<boolean>;
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
      update: (id: string, data: { name?: string; description?: string; coverArt?: string }) => Promise<unknown>;
      delete: (id: string) => Promise<void>;
      getTracks: (playlistId: string) => Promise<unknown[]>;
      addTrack: (playlistId: string, trackId: string) => Promise<unknown>;
      removeTrack: (playlistId: string, trackId: string) => Promise<void>;
      reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
    };
  };
  lyrics: {
    fetch: (
      title: string,
      artist: string,
      album?: string,
      duration?: number
    ) => Promise<{
      synced: Array<{ time: number; text: string }> | null;
      plain: string | null;
      source: 'lrclib' | 'cache' | null;
    }>;
  };
  media: {
    onCommand: (callback: (command: string) => void) => () => void;
    sendPlaybackState: (state: {
      isPlaying: boolean;
      title: string;
      artist: string;
      album: string;
      duration: number;
      currentTime: number;
      albumArt: string | null;
    }) => void;
    clearState: () => void;
  };
  downloader: {
    search: (query: string) => Promise<Array<{
      id: string;
      title: string;
      uploader: string;
      duration: number;
      thumbnail: string;
      url: string;
      webpage_url: string;
    }>>;
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
    check: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    onProgress: (callback: (data: {
      url: string;
      progress: number;
      status: 'downloading' | 'converting' | 'done' | 'error';
      error?: string;
    }) => void) => () => void;
    installYtDlp: () => Promise<{ success: boolean; error?: string }>;
    onInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    getYtDlpPath: () => Promise<string>;
    checkFfmpeg: () => Promise<{
      installed: boolean;
      version?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
    }>;
    installFfmpeg: () => Promise<{ success: boolean; error?: string }>;
    onFfmpegInstallProgress: (callback: (progress: { percent: number }) => void) => () => void;
    installDependencies: () => Promise<{ success: boolean; error?: string }>;
    onDependencyInstallProgress: (callback: (progress: {
      target: 'ytdlp' | 'ffmpeg';
      percent: number;
      overallPercent: number;
      label: string;
    }) => void) => () => void;
  };
  shell: {
    showInFolder: (filePath: string) => Promise<void>;
  };
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) => Promise<T>;
  };
  platform: NodeJS.Platform;
}

const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: createIpcListener<boolean>('window:maximized-change'),
  },
  store: {
    get: <T>(key: string) => ipcRenderer.invoke('store:get', key) as Promise<T | undefined>,
    set: <T>(key: string, value: T) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
    openFile: (options?: unknown) => ipcRenderer.invoke('dialog:open-file', options),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
  library: {
    parseMetadata: (filePath: string) => ipcRenderer.invoke('library:parse-metadata', filePath),
    parseFiles: (filePaths: string[]) => ipcRenderer.invoke('library:parse-files', filePaths),
    scanFolder: (dirPath: string) => ipcRenderer.invoke('library:scan-folder', dirPath),
  },
  db: {
    tracks: {
      getAll: () => ipcRenderer.invoke('db:tracks:get-all'),
      add: (track: unknown) => ipcRenderer.invoke('db:tracks:add', track),
      addMany: (tracks: unknown[]) => ipcRenderer.invoke('db:tracks:add-many', tracks),
      remove: (id: string) => ipcRenderer.invoke('db:tracks:remove', id),
      removeMany: (ids: string[]) => ipcRenderer.invoke('db:tracks:remove-many', ids),
      update: (id: string, data: unknown) => ipcRenderer.invoke('db:tracks:update', id, data),
      toggleFavorite: (id: string) => ipcRenderer.invoke('db:tracks:toggle-favorite', id),
      getFavorites: () => ipcRenderer.invoke('db:tracks:get-favorites'),
      incrementPlayCount: (id: string) => ipcRenderer.invoke('db:tracks:increment-play-count', id),
      exists: (filePath: string) => ipcRenderer.invoke('db:tracks:exists', filePath),
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
      update: (id: string, data: { name?: string; description?: string; coverArt?: string }) =>
        ipcRenderer.invoke('db:playlists:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('db:playlists:delete', id),
      getTracks: (playlistId: string) => ipcRenderer.invoke('db:playlists:get-tracks', playlistId),
      addTrack: (playlistId: string, trackId: string) =>
        ipcRenderer.invoke('db:playlists:add-track', { playlistId, trackId }),
      removeTrack: (playlistId: string, trackId: string) =>
        ipcRenderer.invoke('db:playlists:remove-track', { playlistId, trackId }),
      reorder: (playlistId: string, trackIds: string[]) =>
        ipcRenderer.invoke('db:playlists:reorder', { playlistId, trackIds }),
    },
  },
  lyrics: {
    fetch: (title: string, artist: string, album?: string, duration?: number) =>
      ipcRenderer.invoke('lyrics:fetch', title, artist, album, duration),
  },
  media: {
    onCommand: createIpcListener<string>('media:command'),
    sendPlaybackState: (state) => ipcRenderer.send('media:playback-state', state),
    clearState: () => ipcRenderer.send('media:clear-state'),
  },
  downloader: {
    search: (query: string) => ipcRenderer.invoke('downloader:search', query),
    download: (url: string) => ipcRenderer.invoke('downloader:download', { url }),
    getDownloadLocation: () => ipcRenderer.invoke('downloader:get-download-location'),
    setDownloadLocation: (downloadPath: string | null) =>
      ipcRenderer.invoke('downloader:set-download-location', downloadPath),
    checkDependencies: () => ipcRenderer.invoke('downloader:check-dependencies'),
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
    onFfmpegInstallProgress: createIpcListener<{ percent: number }>('downloader:ffmpeg-install-progress'),
    installDependencies: () => ipcRenderer.invoke('downloader:install-dependencies'),
    onDependencyInstallProgress: createIpcListener<{
      target: 'ytdlp' | 'ffmpeg';
      percent: number;
      overallPercent: number;
      label: string;
    }>('downloader:dependency-install-progress'),
  },
  shell: {
    showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  },
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) =>
      invokeWithTimeout<T>(channel, timeout, ...args),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
