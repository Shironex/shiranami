import { existsSync } from 'node:fs';
import path from 'node:path';

import micromatch from 'micromatch';

/*
 * Allowlist globs are written relative to the monorepo root (e.g.
 * `apps/desktop/src/main/**`), but ESLint may be invoked from a nested
 * directory (lint-staged), making `path.relative` against context.cwd yield a
 * path the globs never match. Resolve every file against the workspace root
 * (nearest ancestor with pnpm-workspace.yaml) so the same glob matches no
 * matter which directory ESLint was invoked from.
 */
const ROOT_MARKER = 'pnpm-workspace.yaml';
const rootCache = new Map<string, string>();

function findRepoRoot(startDir: string): string {
  const cached = rootCache.get(startDir);
  if (cached !== undefined) {
    return cached;
  }

  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, ROOT_MARKER))) {
      rootCache.set(startDir, dir);
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      rootCache.set(startDir, startDir);
      return startDir;
    }
    dir = parent;
  }
}

/** Forward-slash path of `filename` relative to the monorepo root. */
export function toRepoRelative(filename: string): string {
  const absolute = path.resolve(filename);
  const root = findRepoRoot(path.dirname(absolute));
  return path.relative(root, absolute).split(path.sep).join('/');
}

/**
 * True when the file is covered by one of the allowlist globs (micromatch
 * syntax, dotfiles included), matched against its monorepo-root-relative path.
 * An empty pattern list allowlists nothing.
 */
export function isAllowlisted(filename: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return micromatch.isMatch(toRepoRelative(filename), [...patterns], { dot: true });
}
