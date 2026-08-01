/**
 * The two ways v1 hands a user over to v2.
 *
 * **Windows — automatic.** Download the Tauri NSIS installer, verify its sha256
 * against the manifest, spawn it detached in passive mode, quit. The installer
 * carries an `NSIS_HOOK_PREINSTALL` that removes the Electron entry, so the
 * user never sees two Shiranamis in Add/Remove Programs.
 *
 * **Everywhere else — a modal.** v1 has no auto-updater on macOS at all (the
 * app is unsigned), so there is no updater to hand over *from*; an unsigned app
 * rewriting `/Applications` and relaunching is exactly the Gatekeeper-quarantined
 * path that fails silently on user machines. A blocking dialog linking to the
 * download is the honest version of what those users already do by hand.
 */

import { app, dialog, shell, type BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import type { V2Artifact, V2Manifest } from './manifest';
import {
  INSTALLER_DIR_NAME,
  INSTALLER_MAX_BYTES,
  INSTALLER_TIMEOUT_MS,
  NSIS_PASSIVE_FLAG,
} from './constants';

/** Installer file names we are willing to write and execute. */
const SAFE_INSTALLER_NAME = /^[A-Za-z0-9._-]+\.exe$/;

/**
 * Derive a safe local file name from the artifact URL. Returns null when the
 * URL is unparseable or its basename is anything other than a plain `.exe` —
 * the manifest is remote input, so it never gets to choose a path.
 */
export function installerFileName(artifactUrl: string): string | null {
  let base: string;
  try {
    base = path.posix.basename(new URL(artifactUrl).pathname);
  } catch {
    return null;
  }
  return SAFE_INSTALLER_NAME.test(base) ? base : null;
}

/** Lowercase hex sha256 of a buffer. */
function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Download the artifact and verify it byte-for-byte against the manifest.
 * Returns the path of the verified installer, or null on any failure (network,
 * size mismatch, digest mismatch, disk).
 */
async function downloadVerifiedInstaller(artifact: V2Artifact): Promise<string | null> {
  const fileName = installerFileName(artifact.url);
  if (!fileName) {
    logger.error('[v2-bridge] Manifest artifact URL is not a plain installer file');
    return null;
  }

  if (artifact.size > INSTALLER_MAX_BYTES) {
    logger.error(`[v2-bridge] Manifest artifact exceeds the size ceiling (${artifact.size} bytes)`);
    return null;
  }

  const targetDir = path.join(app.getPath('userData'), INSTALLER_DIR_NAME);
  const targetPath = path.join(targetDir, fileName);

  let bytes: Buffer;
  try {
    const response = await fetch(artifact.url, {
      signal: AbortSignal.timeout(INSTALLER_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error(`[v2-bridge] Installer download failed: HTTP ${response.status}`);
      return null;
    }
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logger.error('[v2-bridge] Installer download failed:', error);
    return null;
  }

  if (bytes.length !== artifact.size) {
    logger.error(
      `[v2-bridge] Installer size mismatch: expected ${artifact.size}, got ${bytes.length}`
    );
    return null;
  }

  const digest = sha256(bytes);
  if (digest.toLowerCase() !== artifact.sha256.toLowerCase()) {
    logger.error('[v2-bridge] Installer sha256 mismatch — refusing to run it');
    return null;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, bytes);
  } catch (error) {
    logger.error('[v2-bridge] Could not write the installer to disk:', error);
    return null;
  }

  return targetPath;
}

/**
 * Windows automatic handover. Returns true only once the installer is spawned
 * and the quit is requested; every failure returns false so the caller can fall
 * back to the manual notice.
 */
export async function runWindowsHandover(artifact: V2Artifact): Promise<boolean> {
  const installerPath = await downloadVerifiedInstaller(artifact);
  if (!installerPath) return false;

  try {
    const child = spawn(installerPath, [NSIS_PASSIVE_FLAG], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (error) {
    logger.error('[v2-bridge] Could not launch the v2 installer:', error);
    return false;
  }

  logger.info('[v2-bridge] v2 installer launched — quitting v1');
  app.quit();
  return true;
}

/** Where the manual path sends the user: the landing page when the manifest
 * names one, otherwise the artifact itself. */
export function manualDownloadUrl(manifest: V2Manifest, artifact: V2Artifact): string {
  return manifest.download_page ?? artifact.url;
}

/**
 * Manual handover notice. Modal against the main window so it is unmissable,
 * and opens the download in the user's browser rather than touching the
 * installed app. Never throws.
 */
export async function showHandoverNotice(
  mainWindow: BrowserWindow | null,
  manifest: V2Manifest,
  artifact: V2Artifact
): Promise<void> {
  const options = {
    type: 'info' as const,
    buttons: [`Download Shiranami ${manifest.version}`, 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: `Shiranami ${manifest.version} is here`,
    message: `Shiranami ${manifest.version} is here`,
    detail:
      'This version of Shiranami will not update itself to the new one. ' +
      'Download it from the site and install it over this copy — your library, ' +
      'playlists and settings are carried across on first launch, and nothing ' +
      'in this version is removed.',
  };

  try {
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showMessageBox(mainWindow, options)
        : await dialog.showMessageBox(options);

    if (result.response === 0) {
      await shell.openExternal(manualDownloadUrl(manifest, artifact));
    }
  } catch (error) {
    logger.warn('[v2-bridge] Could not present the handover notice:', error);
  }
}
