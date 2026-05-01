import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ipcHandlers,
  ipcOnListeners,
  createMainWindowMock,
  asBrowserWindow,
} from '../../../test/setup';

// Hoisted so the vi.mock factory below can close over the same instance the
// tests assert against (vi.mock runs before any module-scope initializers).
const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    get: vi.fn<(key: string) => unknown>(),
    set: vi.fn<(key: string, value: unknown) => void>(),
    delete: vi.fn<(key: string) => void>(),
  },
}));

vi.mock('../store', () => ({
  store: mockStore,
}));

import { cleanupWindowHandlers, registerWindowHandlers } from './window';

describe('registerWindowHandlers', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    ipcOnListeners.clear();
    vi.clearAllMocks();
  });

  it('toggles maximize on window:maximize ipc handler', () => {
    const win = createMainWindowMock();
    win.isMaximized.mockReturnValue(false);
    registerWindowHandlers(asBrowserWindow(win));

    const maximizeHandler = ipcHandlers.get('window:maximize');
    expect(maximizeHandler).toBeDefined();
    maximizeHandler!(null as never);
    expect(win.maximize).toHaveBeenCalledTimes(1);

    win.isMaximized.mockReturnValue(true);
    maximizeHandler!(null as never);
    expect(win.unmaximize).toHaveBeenCalledTimes(1);
  });

  it('returns maximized state from window:is-maximized', async () => {
    const win = createMainWindowMock();
    win.isMaximized.mockReturnValue(true);
    registerWindowHandlers(asBrowserWindow(win));

    const result = await ipcHandlers.get('window:is-maximized')!(null as never);
    expect(result).toBe(true);
  });

  it('sets always-on-top via window:set-always-on-top', async () => {
    const win = createMainWindowMock();
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-always-on-top')!(null as never, true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('enters compact mode: unmaximizes, fixes size, marks not resizable', async () => {
    const win = createMainWindowMock();
    win.isMaximized.mockReturnValue(true);
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);

    expect(win.unmaximize).toHaveBeenCalled();
    expect(win.setResizable).toHaveBeenCalledWith(false);
    expect(win.setMinimumSize).toHaveBeenCalledWith(500, 214);
    expect(win.setMaximumSize).toHaveBeenCalledWith(500, 214);
    expect(win.setSize).toHaveBeenCalledWith(500, 214, true);
  });

  it('enters compact mode with caller-provided dimensions', async () => {
    const win = createMainWindowMock();
    win.isMaximized.mockReturnValue(false);
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true, {
      width: 600,
      height: 260,
    });

    expect(win.setMinimumSize).toHaveBeenCalledWith(600, 260);
    expect(win.setMaximumSize).toHaveBeenCalledWith(600, 260);
    expect(win.setSize).toHaveBeenCalledWith(600, 260, true);
  });

  it('resizes within compact mode without re-saving normalBounds', async () => {
    const win = createMainWindowMock();
    const bounds = { x: 10, y: 20, width: 900, height: 700 };
    win.getNormalBounds.mockReturnValue(bounds);
    win.isMaximized.mockReturnValue(false);
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true, {
      width: 500,
      height: 214,
    });
    expect(win.getNormalBounds).toHaveBeenCalledTimes(1);

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true, {
      width: 600,
      height: 260,
    });

    // Resize-while-compact should not re-capture normalBounds; otherwise we'd
    // overwrite the original maximized/restored state with the compact bounds.
    expect(win.getNormalBounds).toHaveBeenCalledTimes(1);
    expect(win.setMinimumSize).toHaveBeenLastCalledWith(600, 260);
    expect(win.setMaximumSize).toHaveBeenLastCalledWith(600, 260);
    expect(win.setSize).toHaveBeenLastCalledWith(600, 260, true);
  });

  it('exits compact mode: restores bounds when not maximized before compact', async () => {
    const win = createMainWindowMock();
    const bounds = { x: 10, y: 20, width: 900, height: 700 };
    win.getNormalBounds.mockReturnValue(bounds);
    win.isMaximized.mockReturnValue(false);
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);
    await ipcHandlers.get('window:set-compact-mode')!(null as never, false);

    expect(win.setResizable).toHaveBeenCalledWith(true);
    expect(win.setMinimumSize).toHaveBeenCalledWith(800, 600);
    expect(win.setMaximumSize).toHaveBeenCalledWith(0, 0);
    expect(win.setBounds).toHaveBeenCalledWith(bounds, true);
    expect(win.maximize).not.toHaveBeenCalled();
  });

  it('saves compact-window-bounds on exit-compact', async () => {
    const win = createMainWindowMock();
    win.getBounds.mockReturnValue({ x: 1234, y: 567, width: 500, height: 214 });
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);
    await ipcHandlers.get('window:set-compact-mode')!(null as never, false);

    expect(mockStore.set).toHaveBeenCalledWith('compact-window-bounds', { x: 1234, y: 567 });
  });

  it('saves compact-window-bounds when window closes while in compact mode', async () => {
    const win = createMainWindowMock();
    win.getBounds.mockReturnValue({ x: 80, y: 90, width: 500, height: 214 });
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);
    const closeListener = win.on.mock.calls.find(([event]) => event === 'close')?.[1];
    expect(closeListener).toBeDefined();
    closeListener!();

    expect(mockStore.set).toHaveBeenCalledWith('compact-window-bounds', { x: 80, y: 90 });
  });

  it('does not save compact-window-bounds when closing from normal mode', () => {
    const win = createMainWindowMock();
    registerWindowHandlers(asBrowserWindow(win));

    const closeListener = win.on.mock.calls.find(([event]) => event === 'close')?.[1];
    closeListener!();

    expect(mockStore.set).not.toHaveBeenCalledWith('compact-window-bounds', expect.anything());
  });

  it('restores compact-window-bounds on re-entry when position is on-screen', async () => {
    const win = createMainWindowMock();
    mockStore.get.mockReturnValue({ x: 200, y: 300 });
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);

    expect(win.setBounds).toHaveBeenCalledWith({ x: 200, y: 300, width: 500, height: 214 }, true);
    // Should not also call setSize when we already used setBounds for the
    // restore — that would cause a flicker on enter.
    expect(win.setSize).not.toHaveBeenCalled();
  });

  it('falls back to default placement when saved compact bounds are off-screen', async () => {
    const win = createMainWindowMock();
    // Saved at x=5000 — outside the 1920x1080 mock display.
    mockStore.get.mockReturnValue({ x: 5000, y: 5000 });
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);

    expect(win.setBounds).not.toHaveBeenCalled();
    expect(win.setSize).toHaveBeenCalledWith(500, 214, true);
  });

  it('exits compact mode: re-maximizes when was maximized before compact', async () => {
    const win = createMainWindowMock();
    win.isMaximized.mockReturnValue(true);
    registerWindowHandlers(asBrowserWindow(win));

    await ipcHandlers.get('window:set-compact-mode')!(null as never, true);
    await ipcHandlers.get('window:set-compact-mode')!(null as never, false);

    expect(win.maximize).toHaveBeenCalled();
  });

  it('cleanupWindowHandlers removes ipc registrations', () => {
    const win = createMainWindowMock();
    registerWindowHandlers(asBrowserWindow(win));
    expect(ipcHandlers.has('window:set-compact-mode')).toBe(true);
    expect(ipcHandlers.has('window:minimize')).toBe(true);

    cleanupWindowHandlers();

    expect(ipcHandlers.has('window:set-compact-mode')).toBe(false);
    expect(ipcHandlers.has('window:minimize')).toBe(false);
  });
});
