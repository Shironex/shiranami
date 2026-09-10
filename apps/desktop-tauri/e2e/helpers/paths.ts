/**
 * Every path the suite touches, resolved in one place — and the guard that
 * keeps it away from the developer's own profile.
 *
 * The suite runs against a **real, installed-shaped** Shiranami: same binary,
 * same bundle identifier, same `~/Library/Application Support/<identifier>`
 * layout. The only thing separating an E2E run from the machine's actual
 * library is the value of `HOME`, so that redirection is load-bearing enough to
 * be asserted rather than assumed (see {@link assertIsolated}).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `apps/desktop-tauri/e2e`. */
export const E2E_ROOT = path.resolve(here, '..');

/** The workspace root, four levels up from `e2e/helpers`. */
export const REPO_ROOT = path.resolve(E2E_ROOT, '../../..');

/**
 * Scratch root for profiles, staged v1 trees and generated audio.
 *
 * Repo-local rather than `os.tmpdir()` so a failed run leaves the app's log
 * file somewhere a developer can find without reading the runner's output for a
 * random path — and so CI can upload the whole tree as one artifact. Gitignored.
 */
export const TMP_ROOT = path.join(E2E_ROOT, '.tmp');

/**
 * The binary under test.
 *
 * A **debug** build, because the embedded WebDriver server is behind the
 * `shiranami-desktop` crate's `e2e` Cargo feature and `cargo build --features
 * e2e` writes here. `tauri.conf.json` sets `bundle.active = false`, so there is
 * no `.app` to point at even in release — the raw executable is the only
 * artifact either profile produces.
 */
export const APP_BINARY = path.join(REPO_ROOT, 'target/debug/shiranami-desktop');

/** The Tauri bundle identifier; `crates/shiranami-core/src/paths/dirs.rs`. */
export const V2_DIRECTORY_NAME = 'com.shironex.shiranami';

/** Electron's product name, and so the v1 directory; same file. */
export const V1_DIRECTORY_NAME = 'Shiranami';

/** `<home>/Library/Application Support` — macOS's `app_data_root()`. */
export function appSupportDir(home: string): string {
  return path.join(home, 'Library/Application Support');
}

/** Where v2 keeps the profile it boots from. */
export function v2DataDir(home: string): string {
  return path.join(appSupportDir(home), V2_DIRECTORY_NAME);
}

/** Where v1 kept its profile, and so where first-run continuity reads from. */
export function v1DataDir(home: string): string {
  return path.join(appSupportDir(home), V1_DIRECTORY_NAME);
}

/**
 * The app's log file for a given isolated home.
 *
 * `<data>/logs/shiranami-<UTC date>.log`, named per boot by
 * `infra::logging::log_file_name`. The date is UTC, not local, which is why it
 * is recomputed here rather than remembered.
 */
export function logFile(home: string, when: Date = new Date()): string {
  const stamp = when.toISOString().slice(0, 10);
  return path.join(v2DataDir(home), 'logs', `shiranami-${stamp}.log`);
}

/**
 * Refuse to operate on anything that is not one of our scratch homes.
 *
 * The failure this exists to prevent is not subtle — a bug that let `HOME`
 * stay the developer's own would have the suite wipe a real music library's
 * database between specs. Every destructive helper calls this first, so the
 * check sits between the mistake and the damage rather than in a comment.
 */
export function assertIsolated(home: string): void {
  const resolved = path.resolve(home);
  const scratch = path.resolve(TMP_ROOT);

  if (!resolved.startsWith(scratch + path.sep)) {
    throw new Error(
      `refusing to touch ${resolved}: an E2E profile must live under ${scratch}. ` +
        'This guard is the only thing standing between the suite and a real library.'
    );
  }

  const real = process.env.HOME ? path.resolve(process.env.HOME) : null;
  if (real !== null && resolved === real) {
    throw new Error(`refusing to touch ${resolved}: that is the real HOME.`);
  }
}
