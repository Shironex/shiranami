import { BrowserWindow } from 'electron';

/**
 * Resolves the app's main BrowserWindow.
 *
 * Prefers the currently focused window; falls back to the first available
 * window when nothing is focused (e.g. app is backgrounded). Returns null if
 * no windows are open — callers must null-guard before using the result.
 */
export function getMainWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) return focused;
  const all = BrowserWindow.getAllWindows();
  return all[0] ?? null;
}

/**
 * Send an IPC message to the renderer on the main window, guarding against a
 * missing or destroyed window. Resolves the window fresh each call via
 * `getMainWindow()` so it stays correct across window recreation, and is a
 * no-op (returns false) when no live window is mounted — e.g. during teardown
 * or background work.
 *
 * Replaces the `getMainWindow()`/`mainWindowRef` + `isDestroyed()` + `send`
 * triple that was hand-rolled across the lifecycle and IPC modules.
 */
export function sendToRenderer(channel: string, ...args: unknown[]): boolean {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return false;
  win.webContents.send(channel, ...args);
  return true;
}
