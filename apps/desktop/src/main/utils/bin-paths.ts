import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves the directory where yt-dlp / ffmpeg binaries live.
 * In production: <userData>/bin. In dev: <repoRoot>/bin via a package.json walk-up.
 */
export function getBinDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'bin');
  }
  // Dev mode: navigate from app path up to monorepo root
  // app.getAppPath() points to apps/desktop (or similar), walk up to monorepo root
  let dir = app.getAppPath();
  // Walk up until we find package.json with workspaces or hit root
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces || pkg.name === 'shiranami') {
          return path.join(dir, 'bin');
        }
      } catch {
        // ignore parse errors
      }
    }
    dir = path.dirname(dir);
  }
  // Fallback to userData even in dev
  return path.join(app.getPath('userData'), 'bin');
}
