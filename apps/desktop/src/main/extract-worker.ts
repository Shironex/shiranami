/**
 * Worker thread for zip extraction — keeps the main thread responsive.
 * Receives { zipPath, destDir } and extracts using the 3-tier fallback.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';

interface ExtractRequest {
  zipPath: string;
  destDir: string;
}

function extractZip(zipPath: string, destDir: string): { method: string } {
  // 1. adm-zip (Node.js) — always available
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
    return { method: 'adm-zip' };
  } catch {
    // fall through
  }

  // 2. tar — ships with Windows 10 1803+
  try {
    execFileSync('tar', ['-xf', zipPath, '-C', destDir], { timeout: 120000 });
    return { method: 'tar' };
  } catch {
    // fall through
  }

  // 3. PowerShell Expand-Archive — last resort
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    'Expand-Archive',
    '-Path',
    zipPath,
    '-DestinationPath',
    destDir,
    '-Force',
  ], { timeout: 120000 });
  return { method: 'powershell' };
}

const { zipPath, destDir } = workerData as ExtractRequest;

try {
  const result = extractZip(zipPath, destDir);
  parentPort?.postMessage({ success: true, ...result });
} catch (err) {
  parentPort?.postMessage({
    success: false,
    error: err instanceof Error ? err.message : String(err),
  });
}
