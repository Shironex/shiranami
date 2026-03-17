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
