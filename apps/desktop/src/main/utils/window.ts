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
