import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ipcHandlers,
  ipcOnListeners,
  createMainWindowMock,
  asBrowserWindow,
} from '../../../test/setup';
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
