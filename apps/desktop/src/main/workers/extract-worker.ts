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
  const errors: string[] = [];

  // 1. adm-zip (Node.js) — always available
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
    return { method: 'adm-zip' };
  } catch (e) {
    errors.push(`adm-zip: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. tar — ships with Windows 10 1803+
  try {
    execFileSync('tar', ['-xf', zipPath, '-C', destDir], { timeout: 120000 });
    return { method: 'tar' };
  } catch (e) {
    errors.push(`tar: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. PowerShell Expand-Archive — last resort
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Expand-Archive',
        '-Path',
        zipPath,
        '-DestinationPath',
        destDir,
        '-Force',
      ],
      { timeout: 120000 }
    );
    return { method: 'powershell' };
  } catch (e) {
    errors.push(`powershell: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(`All extraction methods failed: ${errors.join('; ')}`);
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
