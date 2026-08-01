import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';
import { makeTempDir, cleanupTempDir } from '../../../../test/setup';

const { mockLogger, mockApp, mockStore, mockSentry, mockHandover } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockApp: { userData: '', version: '1.0.0', isPackaged: true },
  mockStore: { get: vi.fn(), set: vi.fn() },
  mockSentry: { captureMessage: vi.fn(), captureException: vi.fn() },
  mockHandover: { runWindowsHandover: vi.fn(), showHandoverNotice: vi.fn() },
}));

vi.mock('../logger', () => ({ logger: mockLogger }));
vi.mock('../store', () => ({ store: mockStore }));
vi.mock('@sentry/electron/main', () => mockSentry);
vi.mock('./handover', () => mockHandover);
vi.mock('../updater', () => ({
  INITIAL_UPDATE_CHECK_DELAY_MS: 5_000,
  UPDATE_CHECK_INTERVAL_MS: 60 * 60 * 1000,
}));
vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => (key === 'userData' ? mockApp.userData : '/mock/unknown'),
    getVersion: () => mockApp.version,
    get isPackaged() {
      return mockApp.isPackaged;
    },
  },
}));

import { checkForV2Handover, initializeV2Bridge, stopV2Bridge } from './index';
import { __resetManifestLogGate, currentPlatformKey, type V2Manifest } from './manifest';
import { CROSSOVER_PINGED_KEY, HANDOFF_FILE_NAME, RENDERER_STATE_FILE_NAME } from './constants';

const fetchMock = vi.fn();
let dir: string;
let realPlatform: PropertyDescriptor | undefined;

function manifestFixture(overrides: Partial<V2Manifest> = {}): V2Manifest {
  return {
    enabled: true,
    version: '2.0.0',
    min_v1_version: '1.0.0',
    platforms: {
      [currentPlatformKey()]: {
        url: 'https://shiranami.app/releases/Shiranami_2.0.0_x64-setup.exe',
        sha256: 'a'.repeat(64),
        size: 1024,
      },
    },
    ...overrides,
  };
}

function serveManifest(manifest: V2Manifest | null, status = 404): void {
  const body = manifest ? JSON.stringify(manifest) : 'Not Found';
  fetchMock.mockResolvedValue({
    ok: manifest !== null,
    status: manifest ? 200 : status,
    headers: { get: () => String(body.length) },
    text: async () => body,
  });
}

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

const win = {
  isDestroyed: () => false,
  webContents: { executeJavaScript: vi.fn().mockResolvedValue({ 'shiranami.theme': '"dark"' }) },
} as unknown as BrowserWindow;

/** Files the bridge is allowed to leave in `userData` once it has acted. */
function handoffArtifacts(): string[] {
  return fs.readdirSync(dir).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  stopV2Bridge();
  __resetManifestLogGate();
  dir = makeTempDir();
  mockApp.userData = dir;
  mockApp.version = '1.0.0';
  mockApp.isPackaged = true;
  mockStore.get.mockReturnValue(undefined);
  mockHandover.runWindowsHandover.mockResolvedValue(true);
  mockHandover.showHandoverNotice.mockResolvedValue(undefined);
  realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  if (realPlatform) Object.defineProperty(process, 'platform', realPlatform);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  stopV2Bridge();
  cleanupTempDir(dir);
});

describe('checkForV2Handover — dormant', () => {
  it.each([
    ['the manifest 404s', () => serveManifest(null)],
    ['the network is down', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    ['the body is not JSON', () => serveManifest(null, 200)],
  ])('does nothing at all when %s', async (_label, arrange) => {
    arrange();

    await expect(checkForV2Handover(win)).resolves.toBe('dormant');

    expect(handoffArtifacts()).toEqual([]);
    expect(mockHandover.runWindowsHandover).not.toHaveBeenCalled();
    expect(mockHandover.showHandoverNotice).not.toHaveBeenCalled();
    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    expect(mockStore.set).not.toHaveBeenCalled();
  });

  it('never touches the renderer while dormant', async () => {
    serveManifest(null);

    await checkForV2Handover(win);

    expect(win.webContents.executeJavaScript).not.toHaveBeenCalled();
  });

  it('does not surface a manifest whose kill switch is off', async () => {
    serveManifest(manifestFixture({ enabled: false }));

    await expect(checkForV2Handover(win)).resolves.toBe('not-applicable');
    expect(handoffArtifacts()).toEqual([]);
    expect(mockHandover.showHandoverNotice).not.toHaveBeenCalled();
  });

  it('does not surface to an install below the minimum v1 version', async () => {
    mockApp.version = '0.20.0';
    serveManifest(manifestFixture({ min_v1_version: '1.0.0' }));

    await expect(checkForV2Handover(win)).resolves.toBe('not-applicable');
    expect(handoffArtifacts()).toEqual([]);
  });

  it('does not surface when the manifest has no artifact for this platform', async () => {
    serveManifest(manifestFixture({ platforms: {} }));

    await expect(checkForV2Handover(win)).resolves.toBe('not-applicable');
    expect(handoffArtifacts()).toEqual([]);
  });
});

describe('checkForV2Handover — active', () => {
  it('writes both handoff files before surfacing anything', async () => {
    setPlatform('darwin');
    serveManifest(manifestFixture());

    await expect(checkForV2Handover(win)).resolves.toBe('notified');

    expect(handoffArtifacts()).toEqual([HANDOFF_FILE_NAME, RENDERER_STATE_FILE_NAME].sort());
    const dump = JSON.parse(
      fs.readFileSync(path.join(dir, RENDERER_STATE_FILE_NAME), 'utf8')
    ) as Record<string, unknown>;
    expect(dump.keys).toEqual({ 'shiranami.theme': '"dark"' });
  });

  it('shows the manual notice off Windows and never spawns an installer', async () => {
    setPlatform('darwin');
    serveManifest(manifestFixture());

    await checkForV2Handover(win);

    expect(mockHandover.showHandoverNotice).toHaveBeenCalledTimes(1);
    expect(mockHandover.runWindowsHandover).not.toHaveBeenCalled();
  });

  it('runs the automatic handover on a packaged Windows build', async () => {
    setPlatform('win32');
    serveManifest(manifestFixture());

    await expect(checkForV2Handover(win)).resolves.toBe('handed-off');

    expect(mockHandover.runWindowsHandover).toHaveBeenCalledTimes(1);
    expect(mockHandover.showHandoverNotice).not.toHaveBeenCalled();
  });

  it('falls back to the manual notice when the automatic handover fails', async () => {
    setPlatform('win32');
    mockHandover.runWindowsHandover.mockResolvedValue(false);
    serveManifest(manifestFixture());

    await expect(checkForV2Handover(win)).resolves.toBe('notified');
    expect(mockHandover.showHandoverNotice).toHaveBeenCalledTimes(1);
  });

  it('uses the manual notice on an unpackaged Windows run', async () => {
    setPlatform('win32');
    mockApp.isPackaged = false;
    serveManifest(manifestFixture());

    await checkForV2Handover(win);

    expect(mockHandover.runWindowsHandover).not.toHaveBeenCalled();
    expect(mockHandover.showHandoverNotice).toHaveBeenCalledTimes(1);
  });

  it('surfaces at most once per session', async () => {
    setPlatform('darwin');
    serveManifest(manifestFixture());

    await checkForV2Handover(win);
    await expect(checkForV2Handover(win)).resolves.toBe('already-surfaced');

    expect(mockHandover.showHandoverNotice).toHaveBeenCalledTimes(1);
  });

  it('still surfaces the handover when the settings store is unreadable', async () => {
    setPlatform('darwin');
    mockStore.get.mockImplementation(() => {
      throw new Error('store is corrupt');
    });
    serveManifest(manifestFixture());

    await expect(checkForV2Handover(win)).resolves.toBe('notified');
    expect(mockHandover.showHandoverNotice).toHaveBeenCalledTimes(1);
  });
});

describe('crossover ping', () => {
  beforeEach(() => {
    setPlatform('darwin');
    serveManifest(manifestFixture());
  });

  it('stays silent when telemetry consent is off', async () => {
    mockStore.get.mockReturnValue(undefined);

    await checkForV2Handover(win);

    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    expect(mockStore.set).not.toHaveBeenCalled();
  });

  it('fires once and records the flag when consent is on', async () => {
    mockStore.get.mockImplementation((key: string) =>
      key === 'app.telemetryEnabled' ? true : undefined
    );

    await checkForV2Handover(win);

    expect(mockSentry.captureMessage).toHaveBeenCalledWith(
      'v2-crossover',
      expect.objectContaining({ level: 'info' })
    );
    expect(mockStore.set).toHaveBeenCalledWith(CROSSOVER_PINGED_KEY, true);
  });

  it('does not fire again once the flag is set', async () => {
    mockStore.get.mockReturnValue(true);

    await checkForV2Handover(win);

    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('initializeV2Bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.SHIRANAMI_V2_MANIFEST_URL;
  });

  afterEach(() => {
    delete process.env.SHIRANAMI_V2_MANIFEST_URL;
  });

  it('does not poll at all in development', () => {
    serveManifest(null);

    initializeV2Bridge(win, true);
    vi.advanceTimersByTime(10 * 60 * 60 * 1000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls in development when a test manifest URL is pointed at it', async () => {
    process.env.SHIRANAMI_V2_MANIFEST_URL = 'https://example.test/v2.json';
    serveManifest(null);

    initializeV2Bridge(win, true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never polls before the app has settled, then polls hourly', async () => {
    serveManifest(null);

    initializeV2Bridge(win, false);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — a second init does not double the polling', async () => {
    serveManifest(null);

    initializeV2Bridge(win, false);
    initializeV2Bridge(win, false);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops polling once the bridge is torn down', async () => {
    serveManifest(null);

    initializeV2Bridge(win, false);
    stopV2Bridge();
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
