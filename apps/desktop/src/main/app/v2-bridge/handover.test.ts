import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';
import { makeTempDir, cleanupTempDir } from '../../../../test/setup';

const { mockLogger, mockApp, mockDialog, mockShell, mockSpawn } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockApp: { userData: '', quit: vi.fn() },
  mockDialog: { showMessageBox: vi.fn() },
  mockShell: { openExternal: vi.fn() },
  mockSpawn: vi.fn(),
}));

vi.mock('../logger', () => ({ logger: mockLogger }));
vi.mock('child_process', () => ({ spawn: mockSpawn }));
vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => (key === 'userData' ? mockApp.userData : '/mock/unknown'),
    quit: mockApp.quit,
  },
  dialog: mockDialog,
  shell: mockShell,
}));

import {
  installerFileName,
  manualDownloadUrl,
  runWindowsHandover,
  showHandoverNotice,
} from './handover';
import { INSTALLER_DIR_NAME, INSTALLER_MAX_BYTES, NSIS_PASSIVE_FLAG } from './constants';
import type { V2Artifact, V2Manifest } from './manifest';

const INSTALLER_BYTES = Buffer.from('MZ-this-is-a-tauri-nsis-installer');
const INSTALLER_SHA = createHash('sha256').update(INSTALLER_BYTES).digest('hex');
const INSTALLER_URL = 'https://shiranami.app/releases/Shiranami_2.0.0_x64-setup.exe';

const fetchMock = vi.fn();
let dir: string;

function artifact(overrides: Partial<V2Artifact> = {}): V2Artifact {
  return {
    url: INSTALLER_URL,
    sha256: INSTALLER_SHA,
    size: INSTALLER_BYTES.length,
    ...overrides,
  };
}

function manifest(overrides: Partial<V2Manifest> = {}): V2Manifest {
  return {
    enabled: true,
    version: '2.0.0',
    min_v1_version: '1.0.0',
    platforms: { 'win32-x64': artifact() },
    ...overrides,
  };
}

function respondWith(bytes: Buffer, init: { ok?: boolean; status?: number } = {}): void {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  });
}

function installerPath(): string {
  return path.join(dir, INSTALLER_DIR_NAME, 'Shiranami_2.0.0_x64-setup.exe');
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = makeTempDir();
  mockApp.userData = dir;
  mockSpawn.mockReturnValue({ unref: vi.fn() });
  mockDialog.showMessageBox.mockResolvedValue({ response: 1 });
  mockShell.openExternal.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanupTempDir(dir);
});

describe('installerFileName', () => {
  it('accepts a plain .exe basename', () => {
    expect(installerFileName(INSTALLER_URL)).toBe('Shiranami_2.0.0_x64-setup.exe');
  });

  it.each([
    ['https://shiranami.app/releases/', 'a bare directory'],
    ['https://shiranami.app/releases/setup.exe.sh', 'a non-exe extension'],
    ['https://shiranami.app/releases/..%2F..%2Fevil.exe', 'an escaped traversal'],
    ['not a url at all', 'an unparseable URL'],
  ])('rejects %s (%s)', url => {
    expect(installerFileName(url)).toBeNull();
  });
});

describe('runWindowsHandover', () => {
  it('downloads, verifies, spawns the installer in passive mode, and quits', async () => {
    respondWith(INSTALLER_BYTES);

    await expect(runWindowsHandover(artifact())).resolves.toBe(true);

    expect(fs.readFileSync(installerPath())).toEqual(INSTALLER_BYTES);
    expect(mockSpawn).toHaveBeenCalledWith(installerPath(), [NSIS_PASSIVE_FLAG], {
      detached: true,
      stdio: 'ignore',
    });
    expect(mockApp.quit).toHaveBeenCalledTimes(1);
  });

  it('refuses to run an installer whose digest does not match the manifest', async () => {
    respondWith(Buffer.from('a completely different payload'));

    await expect(runWindowsHandover(artifact({ size: 30 }))).resolves.toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockApp.quit).not.toHaveBeenCalled();
  });

  it('refuses to run an installer whose length does not match the manifest', async () => {
    respondWith(INSTALLER_BYTES);

    await expect(runWindowsHandover(artifact({ size: 999 }))).resolves.toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('gives up when the download fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(runWindowsHandover(artifact())).resolves.toBe(false);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockApp.quit).not.toHaveBeenCalled();
  });

  it('gives up on a non-2xx download', async () => {
    respondWith(INSTALLER_BYTES, { ok: false, status: 403 });

    await expect(runWindowsHandover(artifact())).resolves.toBe(false);
  });

  it('never fetches an artifact that claims to exceed the size ceiling', async () => {
    await expect(runWindowsHandover(artifact({ size: INSTALLER_MAX_BYTES + 1 }))).resolves.toBe(
      false
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never fetches an artifact whose URL is not a plain installer file', async () => {
    await expect(
      runWindowsHandover(artifact({ url: 'https://shiranami.app/releases/' }))
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not quit when the installer cannot be spawned', async () => {
    respondWith(INSTALLER_BYTES);
    mockSpawn.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(runWindowsHandover(artifact())).resolves.toBe(false);
    expect(mockApp.quit).not.toHaveBeenCalled();
  });
});

describe('manualDownloadUrl', () => {
  it('prefers the landing page when the manifest names one', () => {
    const withPage = manifest({ download_page: 'https://shiranami.app/download' });
    expect(manualDownloadUrl(withPage, artifact())).toBe('https://shiranami.app/download');
  });

  it('falls back to the artifact URL', () => {
    expect(manualDownloadUrl(manifest(), artifact())).toBe(INSTALLER_URL);
  });
});

describe('showHandoverNotice', () => {
  const win = { isDestroyed: () => false } as unknown as BrowserWindow;

  it('presents a modal against the main window and opens the download when accepted', async () => {
    mockDialog.showMessageBox.mockResolvedValue({ response: 0 });

    await showHandoverNotice(
      win,
      manifest({ download_page: 'https://shiranami.app/download' }),
      artifact()
    );

    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(win, expect.anything());
    expect(mockShell.openExternal).toHaveBeenCalledWith('https://shiranami.app/download');
  });

  it('opens nothing when the user picks Later', async () => {
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 });

    await showHandoverNotice(win, manifest(), artifact());

    expect(mockShell.openExternal).not.toHaveBeenCalled();
  });

  it('falls back to a windowless dialog when there is no live window', async () => {
    await showHandoverNotice(null, manifest(), artifact());

    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(expect.anything());
  });

  it('never throws when the dialog cannot be shown', async () => {
    mockDialog.showMessageBox.mockRejectedValue(new Error('no display'));

    await expect(showHandoverNotice(win, manifest(), artifact())).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
