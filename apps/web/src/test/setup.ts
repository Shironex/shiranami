import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';
import {
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
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

// jsdom has no IntersectionObserver. useRafLoop constructs one to gate its loop
// on element visibility, so any component using it (SeekBar, visualizers) needs
// this in tests. The mock is inert — it never fires, so loops stay idle, which
// is the correct default for unit tests that don't drive animation frames.
class IntersectionObserverMock {
  constructor(_callback: IntersectionObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

export function triggerResize(target: Element, rect: { width: number; height: number }): void {
  const contentRect = {
    ...rect,
    top: 0,
    left: 0,
    right: rect.width,
    bottom: rect.height,
    x: 0,
    y: 0,
  } as DOMRectReadOnly;
  for (const inst of resizeObserverInstances) {
    if (!inst.targets.has(target)) continue;
    const entry = {
      target,
      contentRect,
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    } as unknown as ResizeObserverEntry;
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

// jsdom implements none of the pointer-capture API and no scrolling. Radix's
// Select calls all four while opening, so a test that clicks a select trigger
// fails on the primitive rather than on the component. Guarded so a future
// jsdom that grows real implementations keeps them.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
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
      onScanProgress: vi.fn(() => noopUnsub()),
      cancelScan: asyncFn(undefined),
    },
    analysis: {
      analyze: asyncFn({ analyzed: 0, skipped: 0, failed: 0 }),
      cancel: asyncFn(undefined),
      onProgress: vi.fn(() => noopUnsub()),
    },
    loudness: {
      analyze: asyncFn({ analyzed: 0, skipped: 0, failed: 0 }),
      cancel: asyncFn(undefined),
      onProgress: vi.fn(() => noopUnsub()),
    },
    doctor: {
      scan: asyncFn({ scanned: 0, healthy: 0, cancelled: false, findings: [] }),
      cancel: asyncFn(undefined),
      onProgress: vi.fn(() => noopUnsub()),
    },
    waveform: {
      getPeaks: asyncFn(null),
    },
    media: {
      onCommand: vi.fn(() => noopUnsub()),
      sendPlaybackState: vi.fn(),
      clearState: vi.fn(),
    },
    discord: {
      getSettings: asyncFn({
        enabled: false,
        showTrackDetails: true,
        showElapsedTime: true,
        useCustomTemplates: false,
        templates: DEFAULT_DISCORD_TEMPLATES,
      }),
      updateSettings: vi.fn(),
      updatePresence: vi.fn(),
      clearPresence: vi.fn(),
    },
    lyrics: {
      fetch: asyncFn({ synced: null, plain: null, source: null }),
      saveBatch: asyncFn({ saved: 0, skipped: 0, notFound: 0, failed: 0, cancelled: false }),
      saveCancel: asyncFn(undefined),
      onSaveProgress: vi.fn(() => noopUnsub()),
    },
    weather: {
      geocode: asyncFn(null),
      getCurrent: asyncFn({ tempC: 0, condition: 'unknown', label: 'Weather' }),
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
        updateMany: asyncFn(undefined),
        getIdByPath: asyncFn(null),
        search: asyncFn([]),
      },
      history: {
        recordPlay: vi.fn(),
        getRecent: asyncFn([]),
        getSummary: vi.fn(),
        getActivity: asyncFn([]),
        getHourlyActivity: asyncFn([]),
        getWeeklyInsights: asyncFn({ sessionCount: 0, topAlbums: [] }),
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
        addTracks: asyncFn(undefined),
        removeTrack: asyncFn(undefined),
        removeTracks: asyncFn(undefined),
        getPlaylistsForTracks: asyncFn([]),
        reorder: asyncFn(undefined),
      },
      smartPlaylists: {
        getAll: asyncFn([]),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: asyncFn(undefined),
        getTracks: asyncFn([]),
        preview: asyncFn([]),
      },
      folders: {
        getAll: asyncFn([]),
        add: vi.fn(),
        remove: asyncFn(undefined),
        updateScanned: vi.fn(),
      },
      backup: {
        export: asyncFn({ success: false }),
        import: asyncFn({ success: false }),
      },
    },
    downloader: {
      getStreamUrl: asyncFn(''),
      suggest: asyncFn([]),
      search: asyncFn([]),
      download: asyncFn(''),
      enqueueDownload: asyncFn(''),
      cancelDownload: asyncFn(undefined),
      cancelAllDownloads: asyncFn(undefined),
      retryDownload: asyncFn(undefined),
      retryAllFailedDownloads: asyncFn(undefined),
      clearCompletedDownloads: asyncFn(undefined),
      pauseDownloadQueue: asyncFn(undefined),
      resumeDownloadQueue: asyncFn(undefined),
      markDownloadsImported: asyncFn(undefined),
      getDownloadQueue: asyncFn({ items: [], maxConcurrency: 3, activeCount: 0, paused: false }),
      onQueueState: vi.fn(() => noopUnsub()),
      getDownloadLocation: asyncFn({ path: '', defaultPath: '', isDefault: true }),
      setDownloadLocation: asyncFn({ path: '', defaultPath: '', isDefault: true }),
      checkDependencies: asyncFn({ ytdlpInstalled: false, ffmpegInstalled: false }),
      getCachedToolStatus: asyncFn(null),
      refreshToolStatus: asyncFn(null),
      check: asyncFn({ installed: false }),
      onProgress: vi.fn(() => noopUnsub()),
      installYtDlp: asyncFn(undefined),
      onInstallProgress: vi.fn(() => noopUnsub()),
      getYtDlpPath: asyncFn(''),
      checkFfmpeg: asyncFn({ installed: false }),
      installFfmpeg: asyncFn(undefined),
      onFfmpegInstallProgress: vi.fn(() => noopUnsub()),
      installDependencies: asyncFn({ results: [] }),
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
      previewEnrich: asyncFn({
        id: '',
        success: false,
        updatedFields: {},
        source: 'none',
      }),
      cancelEnrichment: asyncFn(undefined),
      onEnrichProgress: vi.fn(() => noopUnsub()),
      writeTags: asyncFn({ success: true }),
    },
    share: {
      track: asyncFn({
        code: 'abc',
        url: 'https://example.com/s/abc',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      playlist: asyncFn({
        code: 'def',
        url: 'https://example.com/s/def',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
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
      getLocaleCountry: asyncFn(''),
    },
    playlist: {
      extract: asyncFn([]),
      cancel: asyncFn(undefined),
      onExtractProgress: vi.fn(() => noopUnsub()),
    },
    debug: {
      start: asyncFn(undefined),
      stop: asyncFn(undefined),
      onMetrics: vi.fn(() => noopUnsub()),
    },
    system: {
      onNotice: vi.fn(() => noopUnsub()),
    },
    storage: {
      getUsage: asyncFn({ volumes: [], computedAt: '1970-01-01T00:00:00.000Z' }),
    },
    recommendations: {
      get: asyncFn({
        library: { kind: 'library', items: [], generatedAt: null, stale: true },
        discover: { kind: 'discover', items: [], generatedAt: null, stale: true },
      }),
      refresh: asyncFn({
        library: { kind: 'library', items: [], generatedAt: null, stale: true },
        discover: { kind: 'discover', items: [], generatedAt: null, stale: true },
      }),
      similar: asyncFn([]),
      notInterested: asyncFn(undefined),
      undoNotInterested: asyncFn(undefined),
      smartMixes: asyncFn([]),
    },
    scrobble: {
      getStatus: asyncFn({
        enabled: false,
        lastfmConnected: false,
        lastfmUsername: null,
        listenBrainzConnected: false,
        pendingCount: 0,
      }),
      setEnabled: asyncFn({
        enabled: false,
        lastfmConnected: false,
        lastfmUsername: null,
        listenBrainzConnected: false,
        pendingCount: 0,
      }),
      lastfmBeginAuth: asyncFn({ ok: true, token: 'tok' }),
      lastfmCompleteAuth: asyncFn({ ok: true, username: null }),
      lastfmDisconnect: asyncFn({
        enabled: false,
        lastfmConnected: false,
        lastfmUsername: null,
        listenBrainzConnected: false,
        pendingCount: 0,
      }),
      listenBrainzConnect: asyncFn({ ok: true, username: null }),
      listenBrainzDisconnect: asyncFn({
        enabled: false,
        lastfmConnected: false,
        lastfmUsername: null,
        listenBrainzConnected: false,
        pendingCount: 0,
      }),
    },
    errors: {
      // Mirrors the preload's structural isIpcError: anything with a string
      // `code` is treated as a rehydrated IpcError (the shape the invoke
      // wrapper produces renderer-side).
      isIpcError: (e: unknown): e is { code: string; message: string; details?: unknown } =>
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        typeof (e as Record<string, unknown>).code === 'string',
      SHARE_ERROR_CODES,
      PLAYLIST_ERROR_CODES,
      VALIDATION_ERROR_CODES,
    },
    platform: 'win32',
    __e2e: false,
  };
}

window.electronAPI = createElectronAPIMock();

// i18n is initialized explicitly now (English bundled, other locales lazy)
// rather than as a module side effect, so boot it here for the test run — the
// previous behavior where importing `@/lib/i18n` initialized it. Guarded so
// suites that `vi.mock('@/lib/i18n')` (which omit `initI18n`) are unaffected.
const { initI18n } = await import('@/lib/i18n');
if (typeof initI18n === 'function') {
  await initI18n();
}
