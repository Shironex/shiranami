import { existsSync } from 'node:fs';
import path from 'node:path';

import micromatch from 'micromatch';

/*
 * Shared helpers for the frontend component-architecture rules. Shiranami's
 * layout is `apps/web/src/components/<feature>/<Name>/<Name>.tsx` — a
 * folder-per-component directly under `components/<feature>/`, with no
 * `features/` segment and no nested `components/` segment. Path logic anchors on
 * the `components/` segment rather than an absolute prefix, so a rule behaves
 * identically whether ESLint runs from the repo root or per-package, and on both
 * POSIX and Windows separators.
 */

/** The directory segment that roots every feature: `components`. */
export const COMPONENT_ROOT_SEGMENT = 'components';

/** The directory segment that roots the app-wide hook modules: `hooks`. */
export const HOOK_ROOT_SEGMENT = 'hooks';

/** Forward-slashed basename of a file (e.g. `DownloadsView.tsx`). */
export function getBasename(filename: string): string {
  return path.basename(filename);
}

/** Forward-slash a path so separators match regardless of OS. */
export function toPosix(filename: string): string {
  return filename.split(path.sep).join('/').split('\\').join('/');
}

/** True when the segment is PascalCase (a component folder/name). */
export function isPascalCase(segment: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(segment);
}

/**
 * True for a single PascalCase `.tsx` basename (`DownloadsView.tsx`). Sidecars
 * carry an extra dotted segment (`DownloadsView.hooks.ts`, `.stories.tsx`,
 * `.test.tsx`) and are excluded, as are kebab-case files. This does not require
 * the folder-per-component layout — `props-must-be-visual` uses it to gate any
 * component-shaped file.
 */
export function isComponentFileName(filename: string): boolean {
  return /^[A-Z][A-Za-z0-9]*\.tsx$/.test(getBasename(filename));
}

/**
 * True for a component entry file in the folder-per-component layout: a single
 * PascalCase `.tsx` whose basename (sans ext) equals its parent directory's
 * basename (`DownloadsView/DownloadsView.tsx`). The structural rules
 * (`component-folder-structure`, `no-state-in-component-body`) key off this so a
 * loose `Foo.tsx` not in its own folder is not treated as an entry shell.
 */
export function isComponentEntryFile(filename: string): boolean {
  if (!isComponentFileName(filename)) {
    return false;
  }
  return getComponentName(filename) === path.basename(path.dirname(filename));
}

/**
 * True for a component file under `components/` that is NOT the entry file of
 * its own folder: a sub-component colocated in another component's folder
 * (`BulkActionBar/MoreMenu.tsx`) or a loose file at a feature root
 * (`splash/SplashRain.tsx`). These still render JSX and hold state, so the body
 * rules apply to them; they are not entry shells, so the folder-structure rule
 * does not.
 */
export function isNestedComponentFile(filename: string): boolean {
  if (!isComponentFileName(filename) || isComponentEntryFile(filename)) {
    return false;
  }
  return getFeatureName(filename) !== null;
}

/** Component name for a component file (`DownloadsView.tsx` -> `DownloadsView`). */
export function getComponentName(filename: string): string {
  return getBasename(filename).replace(/\.tsx$/, '');
}

/**
 * The forward-slashed segments after the `components/` anchor, or `null` when
 * the file is not under a `components/` directory. Used to derive the feature
 * and to test exclusions.
 */
function segmentsAfterComponentRoot(filename: string): readonly string[] | null {
  const marker = `/${COMPONENT_ROOT_SEGMENT}/`;
  const posix = toPosix(filename);
  const idx = posix.lastIndexOf(marker);
  if (idx === -1) {
    return null;
  }
  return posix
    .slice(idx + marker.length)
    .split('/')
    .filter(segment => segment.length > 0);
}

/**
 * The feature a file belongs to: the directory segment immediately under
 * `components/`, or `null` when the file is not under `components/`.
 * `apps/web/src/components/downloads/DownloadsView/DownloadsView.tsx`
 * -> `downloads`.
 */
export function getFeatureName(filename: string): string | null {
  const segments = segmentsAfterComponentRoot(filename);
  if (segments === null || segments.length === 0) {
    return null;
  }
  const feature = segments[0];
  return feature.length > 0 ? feature : null;
}

/** True when the file matches one of the ignore globs (forward-slashed path). */
export function isIgnoredPath(filename: string, ignorePaths: readonly string[]): boolean {
  if (ignorePaths.length === 0) {
    return false;
  }
  return micromatch.isMatch(toPosix(filename), [...ignorePaths], { dot: true });
}

/**
 * True for a feature data file whose hook count `max-hooks-per-file` bounds: a
 * colocated `<Name>.queries.ts` / `.mutations.ts` / `.hooks.ts`, or any module
 * inside a `hooks/` directory (`apps/web/src/hooks/queries/usePlaylists.ts`) —
 * the flat hook modules fill the same role and grow the same grab-bags. Test,
 * spec, and story sidecars are not buckets.
 */
export function isHookBucketFile(filename: string): boolean {
  const basename = getBasename(filename);
  if (/\.(queries|mutations|hooks)\.tsx?$/.test(basename)) {
    return true;
  }
  if (!/\.tsx?$/.test(basename) || /\.(test|spec|stories)\.tsx?$/.test(basename)) {
    return false;
  }
  return toPosix(filename).includes(`/${HOOK_ROOT_SEGMENT}/`);
}

/** True when `sibling` exists on disk in `dir`. Wrapper for testability. */
export function siblingExists(dir: string, sibling: string): boolean {
  return existsSync(path.join(dir, sibling));
}
