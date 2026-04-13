import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type { ElectronAPI } from '@/types/electron';


// Test-accessible ResizeObserver mock. Captures the callback and target so
// tests can trigger synthetic resize entries via `triggerResize(el, rect)`.
interface ResizeObserverMockInstance {
  callback: ResizeObserverCallback;
  targets: Set<Element>;
}
const resizeObserverInstances = new Set<ResizeObserverMockInstance>();

class ResizeObserverMock {
  private instance: ResizeObserverMockInstance;
  constructor(callback: ResizeObserverCallback) {
    this.instance = { callback, targets: new Set() };
    resizeObserverInstances.add(this.instance);
  }
  observe(target: Element): void {
    this.instance.targets.add(target);
  }
  unobserve(target: Element): void {
    this.instance.targets.delete(target);
  }
  disconnect(): void {
    this.instance.targets.clear();
    resizeObserverInstances.delete(this.instance);
  }
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

export function triggerResize(target: Element, rect: { width: number; height: number }): void {
  const contentRect = { ...rect, top: 0, left: 0, right: rect.width, bottom: rect.height, x: 0, y: 0 } as DOMRectReadOnly;
  for (const inst of resizeObserverInstances) {
    if (!inst.targets.has(target)) continue;
    const entry = { target, contentRect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] } as unknown as ResizeObserverEntry;
    inst.callback([entry], {} as ResizeObserver);
  }
}

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
      scanFolder: vi.fn(),
      scanFolderGrouped: asyncFn({ rootTracks: [], subfolders: [] }),
      validateFiles: asyncFn([]),
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
        existsMany: asyncFn([]),
        updateMany: asyncFn([]),
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
        createWithTracks: vi.fn(),
        update: vi.fn(),
        delete: asyncFn(undefined),
        getTracks: asyncFn([]),
        addTrack: vi.fn(),
        removeTrack: asyncFn(undefined),
        getPlaylistsForTracks: asyncFn([]),
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
      suggest: asyncFn([]),
      search: asyncFn([]),
      download: asyncFn(''),
      getDownloadLocation: asyncFn({ path: '', defaultPath: '', isDefault: true }),
      setDownloadLocation: asyncFn({ path: '', defaultPath: '', isDefault: true }),
      checkDependencies: asyncFn({ ytdlpInstalled: false, ffmpegInstalled: false }),
      getCachedToolStatus: asyncFn(null),
      refreshToolStatus: asyncFn(null),
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
    metadata: {
      lookup: asyncFn({ source: 'none', confidence: 0 }),
      enrichTracks: asyncFn([]),
      cancelEnrichment: asyncFn(undefined),
      onEnrichProgress: vi.fn(() => noopUnsub()),
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
      openLogsFolder: asyncFn(undefined),
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
