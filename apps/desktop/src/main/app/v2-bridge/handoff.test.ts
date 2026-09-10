import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';
import { makeTempDir, cleanupTempDir } from '../../../../test/setup';

const { mockLogger, mockApp, mockStore } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockApp: { userData: '', version: '1.0.0' },
  mockStore: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('../logger', () => ({ logger: mockLogger }));
vi.mock('../store', () => ({ store: mockStore }));
vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => (key === 'userData' ? mockApp.userData : '/mock/unknown'),
    getVersion: () => mockApp.version,
  },
}));

import { captureRendererState, writeHandoffFiles } from './handoff';
import { HANDOFF_FILE_NAME, RENDERER_STATE_FILE_NAME } from './constants';

let dir: string;

/** A window whose `executeJavaScript` returns `result` (or rejects with it). */
function windowMock(result: unknown, { reject = false, destroyed = false } = {}) {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      executeJavaScript: vi.fn(() => (reject ? Promise.reject(result) : Promise.resolve(result))),
    },
  } as unknown as BrowserWindow;
}

function readJson(fileName: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8')) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = makeTempDir();
  mockApp.userData = dir;
  mockApp.version = '1.0.0';
  mockStore.get.mockReturnValue(undefined);
});

afterEach(() => {
  cleanupTempDir(dir);
});

describe('captureRendererState', () => {
  it('returns the string-valued keys the page reported', async () => {
    const win = windowMock({ 'shiranami.theme': '"dark"', 'shiranami.accent-store': '{"a":1}' });

    await expect(captureRendererState(win)).resolves.toEqual({
      'shiranami.theme': '"dark"',
      'shiranami.accent-store': '{"a":1}',
    });
  });

  it('scopes the evaluated script to the shiranami key prefix', async () => {
    const win = windowMock({});

    await captureRendererState(win);

    const script = vi.mocked(win.webContents.executeJavaScript).mock.calls[0]?.[0] as string;
    expect(script).toContain('"shiranami."');
    expect(script).toContain('localStorage');
  });

  it('drops non-string values rather than trusting the page', async () => {
    const win = windowMock({ 'shiranami.theme': '"dark"', 'shiranami.bogus': { nested: true } });

    await expect(captureRendererState(win)).resolves.toEqual({ 'shiranami.theme': '"dark"' });
  });

  it('returns an empty dump when there is no window', async () => {
    await expect(captureRendererState(null)).resolves.toEqual({});
  });

  it('returns an empty dump when the window is destroyed', async () => {
    await expect(captureRendererState(windowMock({}, { destroyed: true }))).resolves.toEqual({});
  });

  it('returns an empty dump when evaluation fails', async () => {
    const win = windowMock(new Error('page gone'), { reject: true });

    await expect(captureRendererState(win)).resolves.toEqual({});
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});

describe('writeHandoffFiles', () => {
  it('writes the descriptor v2 needs to find the v1 data', async () => {
    mockStore.get.mockReturnValue('/Users/someone/Music/Shiranami');

    await expect(writeHandoffFiles(windowMock({}))).resolves.toBe(true);

    expect(readJson(HANDOFF_FILE_NAME)).toMatchObject({
      schemaVersion: 1,
      v1Version: '1.0.0',
      platform: process.platform,
      userDataPath: dir,
      databasePath: path.join(dir, 'shiranami.db'),
      downloadsLocation: '/Users/someone/Music/Shiranami',
    });
  });

  it('records a null downloads location when the user never set one', async () => {
    await writeHandoffFiles(windowMock({}));

    expect(readJson(HANDOFF_FILE_NAME).downloadsLocation).toBeNull();
  });

  it('writes the renderer localStorage dump alongside it', async () => {
    const win = windowMock({ 'shiranami.onboarding': '{"completed":true}' });

    await writeHandoffFiles(win);

    expect(readJson(RENDERER_STATE_FILE_NAME)).toMatchObject({
      schemaVersion: 1,
      keys: { 'shiranami.onboarding': '{"completed":true}' },
    });
  });

  it('still writes the descriptor when the renderer state cannot be captured', async () => {
    const win = windowMock(new Error('detached'), { reject: true });

    await expect(writeHandoffFiles(win)).resolves.toBe(true);
    expect(readJson(RENDERER_STATE_FILE_NAME).keys).toEqual({});
    expect(readJson(HANDOFF_FILE_NAME).v1Version).toBe('1.0.0');
  });

  it('leaves no temp file behind', async () => {
    await writeHandoffFiles(windowMock({}));

    expect(fs.readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('reports failure without throwing when the directory is unwritable', async () => {
    mockApp.userData = path.join(dir, 'does', 'not', 'exist');

    await expect(writeHandoffFiles(windowMock({}))).resolves.toBe(false);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('overwrites a previous handoff rather than appending to it', async () => {
    await writeHandoffFiles(windowMock({ 'shiranami.theme': '"light"' }));
    await writeHandoffFiles(windowMock({ 'shiranami.theme': '"dark"' }));

    expect(readJson(RENDERER_STATE_FILE_NAME).keys).toEqual({ 'shiranami.theme': '"dark"' });
  });
});
