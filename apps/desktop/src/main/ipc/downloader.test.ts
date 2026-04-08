import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import { extractVersionSegments, hasUpdate } from './downloader';

describe('extractVersionSegments', () => {
  it('parses standard semver', () => {
    expect(extractVersionSegments('1.2.3')).toEqual([1, 2, 3]);
  });

  it('parses date-based versions', () => {
    expect(extractVersionSegments('2024.01.01')).toEqual([2024, 1, 1]);
  });

  it('extracts version from prefixed string', () => {
    expect(extractVersionSegments('v1.0.0')).toEqual([1, 0, 0]);
  });

  it('returns empty array for null', () => {
    expect(extractVersionSegments(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(extractVersionSegments(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractVersionSegments('')).toEqual([]);
  });
});

describe('hasUpdate', () => {
  it('returns true when latest is newer (patch)', () => {
    expect(hasUpdate('1.0.0', '1.0.1')).toBe(true);
  });

  it('returns true when latest is newer (major)', () => {
    expect(hasUpdate('1.0.0', '2.0.0')).toBe(true);
  });

  it('returns false when versions are the same', () => {
    expect(hasUpdate('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when current is newer', () => {
    expect(hasUpdate('2.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when current is null', () => {
    expect(hasUpdate(null, '1.0.0')).toBe(false);
  });

  it('returns false when latest is null', () => {
    expect(hasUpdate('1.0.0', null)).toBe(false);
  });

  it('handles date-based versions', () => {
    expect(hasUpdate('2024.01.01', '2024.06.15')).toBe(true);
    expect(hasUpdate('2024.06.15', '2024.01.01')).toBe(false);
  });

  it('handles different segment lengths', () => {
    expect(hasUpdate('1.0', '1.0.1')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  IPC handler tests                                                 */
/* ------------------------------------------------------------------ */

// Use path.resolve so paths match OS normalization (Windows prepends drive letter)
const MOCK_MUSIC_DIR = path.resolve('/mock/music');
const MOCK_DEFAULT_DIR = path.join(MOCK_MUSIC_DIR, 'Shiranami Downloads');

const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../store', () => ({
  store: {
    get: (...args: unknown[]) => mockStore.get(...args),
    set: (...args: unknown[]) => mockStore.set(...args),
    delete: (...args: unknown[]) => mockStore.delete(...args),
  },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('electron', async () => {
  const setup = await import('../../../test/setup');
  return {
    ipcMain: {
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
        setup.ipcHandlers.set(channel, fn);
      },
      on: (channel: string, listener: (...args: unknown[]) => void) => {
        if (!setup.ipcOnListeners.has(channel)) {
          setup.ipcOnListeners.set(channel, new Set());
        }
        setup.ipcOnListeners.get(channel)!.add(listener);
      },
      removeHandler: (channel: string) => {
        setup.ipcHandlers.delete(channel);
      },
      removeAllListeners: (channel: string) => {
        setup.ipcOnListeners.delete(channel);
      },
    },
    app: {
      getPath: vi.fn(() => MOCK_MUSIC_DIR),
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
  };
});

vi.mock('../ytdlp-manager', () => ({
  getYtDlpPath: vi.fn(() => '/mock/yt-dlp'),
  isYtDlpInstalled: vi.fn(() => true),
  getYtDlpVersion: vi.fn(async () => '2024.01.01'),
  getLatestYtDlpVersion: vi.fn(async () => '2024.01.01'),
  downloadYtDlp: vi.fn(),
}));

vi.mock('../ffmpeg-manager', () => ({
  getFFmpegDir: vi.fn(() => '/mock/ffmpeg'),
  isFFmpegInstalled: vi.fn(() => true),
  getFFmpegVersion: vi.fn(async () => '6.1'),
  getLatestFFmpegVersion: vi.fn(async () => '6.1'),
  downloadFFmpeg: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
  };
});

// Lazy-import so mocks are established first
const { registerDownloaderHandlers, cleanupDownloaderHandlers } = await import(
  './downloader'
);
const {
  isYtDlpInstalled,
  getYtDlpPath,
  getYtDlpVersion,
  getLatestYtDlpVersion,
} = await import('../ytdlp-manager');
const {
  isFFmpegInstalled,
  getFFmpegVersion,
  getLatestFFmpegVersion,
} = await import('../ffmpeg-manager');
const { ipcHandlers } = await import('../../../test/setup');

/** Restore all mock return values that vi.clearAllMocks() wipes. */
function resetMockDefaults(): void {
  mockStore.get.mockReturnValue(undefined);
  vi.mocked(isYtDlpInstalled).mockReturnValue(true);
  vi.mocked(isFFmpegInstalled).mockReturnValue(true);
  vi.mocked(getYtDlpPath).mockReturnValue('/mock/yt-dlp');
  vi.mocked(getYtDlpVersion).mockResolvedValue('2024.01.01');
  vi.mocked(getLatestYtDlpVersion).mockResolvedValue('2024.01.01');
  vi.mocked(getFFmpegVersion).mockResolvedValue('6.1');
  vi.mocked(getLatestFFmpegVersion).mockResolvedValue('6.1');
}

describe('downloader ipc handlers', () => {
  beforeEach(async () => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    resetMockDefaults();
    registerDownloaderHandlers();
    // Let the background fetchAndCacheToolStatus() settle
    await vi.waitFor(() => {
      expect(mockStore.set).toHaveBeenCalled();
    });
    vi.clearAllMocks();
    resetMockDefaults();
  });

  afterEach(() => {
    cleanupDownloaderHandlers();
  });

  describe('downloader:get-download-location', () => {
    it('returns default path when no custom location is stored', async () => {
      const handler = ipcHandlers.get('downloader:get-download-location')!;
      const result = await handler(null as never);

      expect(result).toEqual({
        path: MOCK_DEFAULT_DIR,
        defaultPath: MOCK_DEFAULT_DIR,
        isDefault: true,
      });
    });
  });

  describe('downloader:set-download-location', () => {
    it('stores a valid custom path and returns isDefault:false', async () => {
      const customPath = '/custom/downloads';
      const resolvedCustom = path.resolve(customPath);

      const handler = ipcHandlers.get('downloader:set-download-location')!;
      // After the handler calls store.set, subsequent store.get calls return the custom path
      mockStore.get.mockImplementation((key: string) => {
        if (key === 'downloads.location') return resolvedCustom;
        return undefined;
      });

      const result = await handler(null as never, customPath);

      expect(mockStore.set).toHaveBeenCalledWith(
        'downloads.location',
        resolvedCustom,
      );
      expect(result).toEqual({
        path: resolvedCustom,
        defaultPath: MOCK_DEFAULT_DIR,
        isDefault: false,
      });
    });

    it('resets to default when null is passed', async () => {
      const handler = ipcHandlers.get('downloader:set-download-location')!;
      const result = await handler(null as never, null);

      expect(mockStore.delete).toHaveBeenCalledWith('downloads.location');
      expect(result).toEqual({
        path: MOCK_DEFAULT_DIR,
        defaultPath: MOCK_DEFAULT_DIR,
        isDefault: true,
      });
    });

    it('resets to default when empty string is passed', async () => {
      const handler = ipcHandlers.get('downloader:set-download-location')!;
      const result = await handler(null as never, '  ');

      expect(mockStore.delete).toHaveBeenCalledWith('downloads.location');
      expect(result).toEqual({
        path: MOCK_DEFAULT_DIR,
        defaultPath: MOCK_DEFAULT_DIR,
        isDefault: true,
      });
    });

    it('clears store key when path normalizes to default', async () => {
      const handler = ipcHandlers.get('downloader:set-download-location')!;
      const result = await handler(null as never, MOCK_DEFAULT_DIR);

      expect(mockStore.delete).toHaveBeenCalledWith('downloads.location');
      expect(mockStore.set).not.toHaveBeenCalled();
      expect(result).toEqual({
        path: MOCK_DEFAULT_DIR,
        defaultPath: MOCK_DEFAULT_DIR,
        isDefault: true,
      });
    });
  });

  describe('downloader:check-dependencies', () => {
    it('returns installed status for both tools', async () => {
      const handler = ipcHandlers.get('downloader:check-dependencies')!;
      const result = await handler(null as never);

      expect(result).toEqual({
        ytdlpInstalled: true,
        ffmpegInstalled: true,
      });
    });

    it('reports missing tools correctly', async () => {
      vi.mocked(isYtDlpInstalled).mockReturnValue(false);
      vi.mocked(isFFmpegInstalled).mockReturnValue(false);

      const handler = ipcHandlers.get('downloader:check-dependencies')!;
      const result = await handler(null as never);

      expect(result).toEqual({
        ytdlpInstalled: false,
        ffmpegInstalled: false,
      });
    });
  });

  describe('downloader:get-cached-tool-status', () => {
    it('returns cached data populated by background startup refresh', async () => {
      // The background fetchAndCacheToolStatus() runs during registerDownloaderHandlers(),
      // so the in-memory cache is already populated after beforeEach settles.
      const handler = ipcHandlers.get('downloader:get-cached-tool-status')!;
      const result = (await handler(null as never)) as Record<string, unknown>;

      expect(result).toHaveProperty('ytdlp');
      expect(result).toHaveProperty('ffmpeg');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('downloader:refresh-tool-status', () => {
    it('fetches fresh status and caches it', async () => {
      const handler = ipcHandlers.get('downloader:refresh-tool-status')!;
      const result = (await handler(null as never)) as Record<string, unknown>;

      expect(result).toHaveProperty('ytdlp');
      expect(result).toHaveProperty('ffmpeg');
      expect(result).toHaveProperty('ytdlpPath', '/mock/yt-dlp');
      expect(result).toHaveProperty('downloadLocation');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('number');

      expect(mockStore.set).toHaveBeenCalledWith(
        'downloads.toolStatusCache',
        expect.objectContaining({
          ytdlp: expect.objectContaining({ installed: true }),
          ffmpeg: expect.objectContaining({ installed: true }),
        }),
      );
    });

    it('returns cached data on subsequent get-cached-tool-status call', async () => {
      const refreshHandler = ipcHandlers.get('downloader:refresh-tool-status')!;
      const refreshed = await refreshHandler(null as never);

      const getCachedHandler = ipcHandlers.get(
        'downloader:get-cached-tool-status',
      )!;
      const cached = await getCachedHandler(null as never);

      expect(cached).toEqual(refreshed);
    });
  });
});
