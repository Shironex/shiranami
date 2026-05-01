import { vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BrowserWindow } from 'electron';

/** Registered `ipcMain.handle` callbacks (channel → handler). */
export const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

/** `ipcMain.on` listeners per channel. */
export const ipcOnListeners = new Map<string, Set<(...args: unknown[]) => void>>();

/** The current mock main window, returned by the stubbed BrowserWindow statics. */
let mockMainWindow: BrowserWindow | null = null;

/** Register a mock BrowserWindow so `getMainWindow()` resolves to it in tests. */
export function setMockMainWindow(win: BrowserWindow | null): void {
  mockMainWindow = win;
}

vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, fn: (...args: unknown[]) => unknown) {
      ipcHandlers.set(channel, fn);
    },
    on(channel: string, listener: (...args: unknown[]) => void) {
      if (!ipcOnListeners.has(channel)) {
        ipcOnListeners.set(channel, new Set());
      }
      ipcOnListeners.get(channel)!.add(listener);
    },
    removeHandler(channel: string) {
      ipcHandlers.delete(channel);
    },
    removeAllListeners(channel: string) {
      ipcOnListeners.delete(channel);
    },
  },
  BrowserWindow: class BrowserWindowStub {
    static getFocusedWindow() {
      return mockMainWindow;
    }
    static getAllWindows() {
      return mockMainWindow ? [mockMainWindow] : [];
    }
  },
  // A single virtual 1920x1080 display covering the origin. Tests that need
  // bespoke geometry (e.g. validating off-screen rejection) can re-mock
  // screen.getAllDisplays in their own beforeEach.
  screen: {
    getAllDisplays: () => [
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ],
  },
}));

export function createMainWindowMock() {
  return {
    isMaximized: vi.fn().mockReturnValue(false),
    unmaximize: vi.fn(),
    maximize: vi.fn(),
    getNormalBounds: vi.fn().mockReturnValue({
      x: 0,
      y: 0,
      width: 1024,
      height: 768,
    }),
    setResizable: vi.fn(),
    setMinimizable: vi.fn(),
    setMinimumSize: vi.fn(),
    setMaximumSize: vi.fn(),
    setSize: vi.fn(),
    setBounds: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 100, y: 100, width: 500, height: 214 }),
    setAlwaysOnTop: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    on: vi.fn(),
    webContents: { send: vi.fn() },
  };
}

export type MainWindowMock = ReturnType<typeof createMainWindowMock>;

export function asBrowserWindow(mock: MainWindowMock): BrowserWindow {
  return mock as unknown as BrowserWindow;
}

export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'shiranami-desktop-test-'));
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function fireIpcOn(channel: string): void {
  const set = ipcOnListeners.get(channel);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}
