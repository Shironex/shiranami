/**
 * Isolated profiles.
 *
 * v1's harness passed Electron `--user-data-dir` and left `HOME` alone. Tauri
 * has no such flag: `app_data_dir()` goes through `dirs`, which reads `$HOME`
 * on macOS and nothing else, and `shiranami_core::paths` does the same by hand
 * so the two agree. Redirecting `HOME` is therefore both the only lever and a
 * *stronger* one than v1 had — it relocates the v1 tree and `~/Music` too, so a
 * fresh profile cannot see the developer's library through any of the three.
 */

import fs from 'node:fs';
import path from 'node:path';

import { TMP_ROOT, assertIsolated, appSupportDir, v2DataDir } from './paths.js';

/** A staged home plus the directories a spec is likely to want. */
export interface Profile {
  /** The value handed to the app as `HOME`. */
  readonly home: string;
  /** `<home>/Library/Application Support/com.shironex.shiranami`. */
  readonly dataDir: string;
  /** Scratch inside the profile for audio fixtures a spec generates. */
  readonly mediaDir: string;
}

/** Where a named profile lives. Names come from the wdio capability list. */
export function profileHome(name: string): string {
  return path.join(TMP_ROOT, 'profiles', name);
}

/**
 * Delete and recreate a profile, returning the empty result.
 *
 * Called from `onPrepare`, once per run — never between specs. Specs inside one
 * capability deliberately share a profile so that a value written by one and
 * read by the next is a real cross-process persistence check rather than a
 * mock; the isolation boundary is the capability, not the spec file.
 */
export function resetProfile(name: string): Profile {
  const home = profileHome(name);
  assertIsolated(home);

  fs.rmSync(home, { recursive: true, force: true });
  const dataDir = v2DataDir(home);
  fs.mkdirSync(dataDir, { recursive: true });

  const mediaDir = path.join(home, 'Media');
  fs.mkdirSync(mediaDir, { recursive: true });
  // `app.path().audio_dir()` is `$HOME/Music`, and the download queue's root.
  // Creating it up front keeps a boot-time `create_dir_all` off the critical
  // path and out of the log.
  fs.mkdirSync(path.join(home, 'Music'), { recursive: true });

  return { home, dataDir, mediaDir };
}

/** A handle to an already-staged profile, without touching the disk. */
export function profile(name: string): Profile {
  const home = profileHome(name);
  return {
    home,
    dataDir: v2DataDir(home),
    mediaDir: path.join(home, 'Media'),
  };
}

/**
 * Merge keys into a profile's `config.json`, creating it if absent.
 *
 * Written the way `core::store` writes it — tab-indented, dot-paths expanded
 * into nested objects — because the app reads this file in place rather than
 * importing it, and a shape it does not recognise is a shape it quietly
 * ignores.
 */
export function seedSettings(target: Profile | string, values: Record<string, unknown>): void {
  const dataDir = typeof target === 'string' ? v2DataDir(target) : target.dataDir;
  assertIsolated(typeof target === 'string' ? target : target.home);

  const file = path.join(dataDir, 'config.json');
  const document: Record<string, unknown> = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>)
    : {};

  for (const [key, value] of Object.entries(values)) {
    setDotPath(document, key, value);
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(document, null, '\t'));
}

/** Read a profile's settings document, or `{}` when it has not been written. */
export function readSettings(target: Profile | string): Record<string, unknown> {
  const dataDir = typeof target === 'string' ? v2DataDir(target) : target.dataDir;
  const file = path.join(dataDir, 'config.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/**
 * Read one dot-path out of a settings document.
 *
 * electron-store's `accessPropertiesByDotNotation` is on by default and v1
 * never turned it off, so `system.minimizeToTray` is nested rather than a
 * literal key — the same asymmetry `core::store::document` documents.
 */
export function settingsValue(target: Profile | string, key: string): unknown {
  let cursor: unknown = readSettings(target);
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setDotPath(document: Record<string, unknown>, key: string, value: unknown): void {
  const segments = key.split('.');
  const last = segments.pop();
  if (last === undefined) return;

  let cursor = document;
  for (const segment of segments) {
    const next = cursor[segment];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[last] = value;
}

/** Every path the app should have created under an isolated home. */
export function describeProfile(home: string): string {
  const support = appSupportDir(home);
  if (!fs.existsSync(support)) return `${home} (no Application Support yet)`;
  return `${home} -> ${fs.readdirSync(support).join(', ')}`;
}
