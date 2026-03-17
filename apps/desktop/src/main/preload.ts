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
