import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

import type { IMetaContext } from './types';

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Per-workspace subdirs holding first-party source worth scanning.
const WORKSPACE_SOURCE_SUBDIRS = ['src', 'test', 'tests'] as const;

// Monorepo roots that contain workspaces.
const WORKSPACE_GROUPS = ['apps', 'packages'] as const;

/*
 * apps/mobile is excluded from the pnpm workspace (its React Native deps break
 * electron-builder packaging), so it is not linted by ESLint either; keep the
 * meta-lint scan in lockstep so it never flags files no other gate covers.
 */
const SKIP_WORKSPACES = new Set(['mobile']);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'generated']);

export function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];

  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) {
        continue;
      }
      out.push(...collectSourceFiles(full));
      continue;
    }

    if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(full))) {
      out.push(full);
    }
  }

  return out;
}

function listWorkspaces(root: string): string[] {
  const workspaces: string[] = [];

  for (const group of WORKSPACE_GROUPS) {
    const groupDir = join(root, group);
    let entries: string[];

    try {
      entries = readdirSync(groupDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (SKIP_WORKSPACES.has(entry)) {
        continue;
      }
      const full = join(groupDir, entry);
      if (statSync(full).isDirectory()) {
        workspaces.push(full);
      }
    }
  }

  return workspaces;
}

export function findWorkflows(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];

  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isFile() && (entry.endsWith('.yml') || entry.endsWith('.yaml'))) {
      out.push(full);
    }
  }

  return out;
}

/*
 * Workflows live at the repository root. Walk up from `root` to the nearest
 * `.github/workflows` so CI rules always scan the workflows that actually run,
 * whether invoked from the repo root or a nested checkout.
 */
export function resolveWorkflowsDir(root: string): string {
  let current = root;

  for (;;) {
    const candidate = join(current, '.github', 'workflows');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return join(root, '.github', 'workflows');
    }
    current = parent;
  }
}

export function buildContext(root: string): IMetaContext {
  const sourceFiles = listWorkspaces(root).flatMap(workspace =>
    WORKSPACE_SOURCE_SUBDIRS.flatMap(subdir => collectSourceFiles(join(workspace, subdir)))
  );

  return {
    root,
    sourceFiles,
    workflowFiles: findWorkflows(resolveWorkflowsDir(root)),
  };
}
