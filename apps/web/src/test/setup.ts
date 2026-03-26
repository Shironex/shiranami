import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type { ElectronAPI } from '@/types/electron';

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

window.scrollTo = vi.fn() as typeof window.scrollTo;

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {};
}

function asyncFn<T>(value: T) {
  return vi.fn().mockResolvedValue(value);
}

const noopUnsub = () => vi.fn();

/** Minimal full-tree mock so `window.electronAPI` matches `ElectronAPI` in tests. */
function createElectronAPIMock(): ElectronAPI {
  return {
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      isMaximized: asyncFn(false),
      setAlwaysOnTop: asyncFn(undefined),
      setCompactMode: asyncFn(undefined),
      onMaximizedChange: vi.fn(() => noopUnsub()),
    },
    store: {
      get: asyncFn(undefined),
      set: asyncFn(undefined),
      delete: asyncFn(undefined),
    },
    dialog: {
      openDirectory: asyncFn(null),
      openFile: asyncFn(null),
    },
    library: {
      parseMetadata: vi.fn(),
      parseFiles: vi.fn(),
      scanFolder: vi.fn(),
    },
    media: {
      onCommand: vi.fn(() => noopUnsub()),
      sendPlaybackState: vi.fn(),
      clearState: vi.fn(),
    },
    lyrics: {
      fetch: asyncFn({ synced: null, plain: null, source: null }),
    },
    db: {
      tracks: {
        getAll: asyncFn([]),
        add: vi.fn(),
        addMany: asyncFn([]),
        remove: asyncFn(undefined),
        removeMany: asyncFn(undefined),
        update: vi.fn(),
        toggleFavorite: vi.fn(),
        getFavorites: asyncFn([]),
        incrementPlayCount: vi.fn(),
        exists: asyncFn(false),
      },
      history: {
        recordPlay: vi.fn(),
        getRecent: asyncFn([]),
        getSummary: vi.fn(),
        getActivity: asyncFn([]),
      },
      playlists: {
        getAll: asyncFn([]),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: asyncFn(undefined),
        getTracks: asyncFn([]),
        addTrack: vi.fn(),
        removeTrack: asyncFn(undefined),
        reorder: asyncFn(undefined),
      },
      folders: {
        getAll: asyncFn([]),
        add: vi.fn(),
        remove: asyncFn(undefined),
        updateScanned: vi.fn(),
      },
    },
    downloader: {
      getStreamUrl: asyncFn(''),
      search: asyncFn([]),
      download: asyncFn(''),
      getDownloadLocation: asyncFn({ path: '', defaultPath: '', isDefault: true }),
      setDownloadLocation: asyncFn({ path: '', defaultPath: '', isDefault: true }),
      checkDependencies: asyncFn({ ytdlpInstalled: false, ffmpegInstalled: false }),
      check: asyncFn({ installed: false }),
      onProgress: vi.fn(() => noopUnsub()),
      installYtDlp: asyncFn({ success: true }),
      onInstallProgress: vi.fn(() => noopUnsub()),
      getYtDlpPath: asyncFn(''),
      checkFfmpeg: asyncFn({ installed: false }),
      installFfmpeg: asyncFn({ success: true }),
      onFfmpegInstallProgress: vi.fn(() => noopUnsub()),
      installDependencies: asyncFn({ success: true }),
      onDependencyInstallProgress: vi.fn(() => noopUnsub()),
    },
    updater: {
      checkForUpdates: asyncFn({ enabled: false }),
      startDownload: asyncFn(undefined),
      installNow: asyncFn(undefined),
      onCheckingForUpdate: vi.fn(() => noopUnsub()),
      onUpdateAvailable: vi.fn(() => noopUnsub()),
      onUpdateNotAvailable: vi.fn(() => noopUnsub()),
      onDownloadProgress: vi.fn(() => noopUnsub()),
      onUpdateDownloaded: vi.fn(() => noopUnsub()),
      onUpdateError: vi.fn(() => noopUnsub()),
    },
    radio: {
      favorites: {
        getAll: asyncFn([]),
        add: vi.fn(),
        remove: asyncFn(undefined),
        isFavorite: asyncFn(false),
      },
    },
    share: {
      track: asyncFn({ code: 'abc', url: 'https://example.com/s/abc', expiresAt: new Date(Date.now() + 3600000).toISOString() }),
      playlist: asyncFn({ code: 'def', url: 'https://example.com/s/def', expiresAt: new Date(Date.now() + 3600000).toISOString() }),
      import: asyncFn({ type: 'TRACK' as const, payload: null }),
      cacheYoutubeId: asyncFn(undefined),
      onDeepLink: vi.fn(() => () => {}),
    },
    shell: {
      showInFolder: asyncFn(undefined),
      trashFile: asyncFn(undefined),
    },
    app: {
      getVersion: asyncFn('0.0.0'),
    },
    playlist: {
      extract: asyncFn([]),
      cancel: asyncFn(undefined),
      onExtractProgress: vi.fn(() => noopUnsub()),
    },
    ipc: {
      invokeWithTimeout: vi.fn(),
    },
    platform: 'win32',
  };
}

window.electronAPI = createElectronAPIMock();
