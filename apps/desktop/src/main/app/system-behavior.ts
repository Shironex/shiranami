import { app, type BrowserWindow } from 'electron';
import { store } from './store';
import { logger } from './logger';

/**
 * System behavior prefs: launch-at-startup and tray-keep-alive window
 * handling. The renderer writes the `system.*` store keys from the Settings ·
 * System section; this module is the main-process side that makes them real.
 * All prefs default to off, so nothing here changes behavior until the user
 * opts in.
 */

// Flips on the first 'before-quit' so an explicit quit (tray menu, Cmd+Q,
// updater restart) is never intercepted by the close-to-tray handler.
let isQuitting = false;

function applyLaunchAtStartup(enabled: boolean): void {
  // setLoginItemSettings is a no-op concept on Linux (and unsupported in
  // unpackaged dev builds on macOS, where the bundle path isn't registered).
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
    logger.info(`[system] Launch at startup ${enabled ? 'enabled' : 'disabled'}`);
  } catch (err) {
    logger.warn('[system] Failed to update login item settings:', err);
  }
}

/**
 * Apply the persisted launch-at-startup state and keep following renderer
 * writes. Call once at bootstrap; returns the watcher unsubscribe.
 */
export function initializeSystemBehavior(): () => void {
  app.on('before-quit', () => {
    isQuitting = true;
  });

  const persisted = store.get('system.launchAtStartup');
  // Only touch the OS login item when the user has expressed a preference —
  // never write OS state on a fresh install.
  if (typeof persisted === 'boolean') {
    applyLaunchAtStartup(persisted);
  }

  return store.onDidChange('system.launchAtStartup', value => {
    applyLaunchAtStartup(value === true);
  });
}

/**
 * Intercept close/minimize on the main window and hide to tray instead when
 * the matching pref is on. Prefs are read at event time so toggling in
 * Settings applies immediately, without re-attaching.
 */
export function attachTrayWindowBehavior(win: BrowserWindow): void {
  win.on('close', event => {
    if (isQuitting || win.isDestroyed()) return;
    if (store.get('system.closeToTray') !== true) return;
    event.preventDefault();
    win.hide();
  });

  win.on('minimize', () => {
    if (win.isDestroyed()) return;
    if (store.get('system.minimizeToTray') !== true) return;
    win.hide();
  });
}
