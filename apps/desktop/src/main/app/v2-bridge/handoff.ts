/**
 * The two files v1 leaves behind for v2's first-run continuity step.
 *
 * Both land next to the library database in `userData`, because that is the
 * directory v2 already has to locate in order to copy the library at all —
 * v1 resolves these paths natively, v2 would otherwise have to guess them.
 *
 * - `v2-handoff.json`     — where v1 kept everything (userData, DB, downloads).
 * - `renderer-state.json` — every `shiranami.*` localStorage key.
 *
 * The localStorage dump exists because Chromium's partition, WKWebView's store
 * and WebView2's store are three separate origins: without it a returning user
 * loses theme, accent, layout, grid size and the onboarding-complete flag, and
 * gets re-onboarded on top of a migration.
 *
 * Neither writer throws. A failure to capture UI preferences must never block
 * the handover — the library is what matters, and v2 re-derives what it can.
 */

import { app, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { store } from '../store';
import {
  HANDOFF_FILE_NAME,
  HANDOFF_SCHEMA_VERSION,
  RENDERER_STATE_FILE_NAME,
  RENDERER_STATE_KEY_PREFIX,
} from './constants';

/** Contents of `v2-handoff.json`. New fields must be optional. */
export interface V2HandoffDescriptor {
  schemaVersion: number;
  capturedAt: string;
  v1Version: string;
  platform: string;
  userDataPath: string;
  databasePath: string;
  /** Resolved download folder, or null when the user never set one. */
  downloadsLocation: string | null;
}

/** Contents of `renderer-state.json`. New fields must be optional. */
export interface V2RendererStateDump {
  schemaVersion: number;
  capturedAt: string;
  /** Raw `shiranami.*` localStorage entries, values left as stored strings. */
  keys: Record<string, string>;
}

/**
 * Serialize `value` to `filePath` via a temp file + rename, so a crash mid-write
 * can never leave v2 reading a truncated descriptor. Mirrors the temp+rename
 * pattern in `services/db-backup.ts` and `downloads/ytdlp-manager.ts`.
 */
function writeJsonAtomic(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Best-effort cleanup; the stale temp file is harmless.
    }
    throw error;
  }
}

/** Absolute path of the live library database. */
function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'shiranami.db');
}

/**
 * Read every `shiranami.*` key out of the renderer's localStorage.
 *
 * Evaluated in the page rather than pushed over IPC so the bridge needs no
 * renderer-side participation at all — a v1.x release that ships this hook
 * carries zero renderer diff and therefore zero renderer regression risk.
 *
 * Returns `{}` when the window is gone or evaluation fails.
 */
export async function captureRendererState(
  mainWindow: BrowserWindow | null
): Promise<Record<string, string>> {
  if (!mainWindow || mainWindow.isDestroyed()) return {};

  const script = `(() => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(${JSON.stringify(RENDERER_STATE_KEY_PREFIX)})) continue;
        const value = localStorage.getItem(key);
        if (typeof value === 'string') out[key] = value;
      }
    } catch {}
    return out;
  })()`;

  try {
    const result: unknown = await mainWindow.webContents.executeJavaScript(script, true);
    if (!result || typeof result !== 'object') return {};

    const dump: Record<string, string> = {};
    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      if (typeof value === 'string') dump[key] = value;
    }
    return dump;
  } catch (error) {
    logger.warn('[v2-bridge] Could not read renderer state:', error);
    return {};
  }
}

/**
 * Write both handoff files. Best-effort and never throws: returns true only
 * when the descriptor (the file v2 actually needs) landed on disk.
 */
export async function writeHandoffFiles(mainWindow: BrowserWindow | null): Promise<boolean> {
  const userDataPath = app.getPath('userData');
  const capturedAt = new Date().toISOString();

  const rendererKeys = await captureRendererState(mainWindow);
  try {
    const dump: V2RendererStateDump = {
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      capturedAt,
      keys: rendererKeys,
    };
    writeJsonAtomic(path.join(userDataPath, RENDERER_STATE_FILE_NAME), dump);
  } catch (error) {
    // UI preferences are recoverable-by-hand; the library is not. Keep going.
    logger.warn('[v2-bridge] Failed to write renderer state:', error);
  }

  try {
    const descriptor: V2HandoffDescriptor = {
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      capturedAt,
      v1Version: app.getVersion(),
      platform: process.platform,
      userDataPath,
      databasePath: getDatabasePath(),
      downloadsLocation: store.get('downloads.location') ?? null,
    };
    writeJsonAtomic(path.join(userDataPath, HANDOFF_FILE_NAME), descriptor);
    logger.info(`[v2-bridge] Wrote handoff descriptor (${Object.keys(rendererKeys).length} keys)`);
    return true;
  } catch (error) {
    logger.error('[v2-bridge] Failed to write handoff descriptor:', error);
    return false;
  }
}
