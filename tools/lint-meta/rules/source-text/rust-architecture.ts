/*
 * Pure-text architectural rules for the Rust tier (docs/v2/architecture.md
 * §2.1, §2.3, §6.1). They are text scans on purpose: `pnpm lint:meta` must stay
 * runnable on a machine — or a CI job — with no cargo and no Tauri system
 * dependencies, which is what makes them cheap enough to run on every change.
 *
 * These carry nightcore's file-shape and layering discipline from day one
 * rather than retrofitting it onto 90k lines later.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { IMetaContext, IMetaRule, IViolation } from '../../types';

// A module may hold this many *code* lines — comments and blanks excluded.
// Past it, the module is doing more than one thing and belongs in siblings.
const MAX_CODE_LINES = 400;

const COMMANDS_DIR = 'apps/desktop-tauri/src-tauri/src/commands/';

/*
 * The dependency spine, as ranks. A crate may only reference a crate of a
 * strictly lower rank; sideways references are how a "layered" workspace
 * quietly becomes a ball of mud.
 *
 * This refines the arrow list in §2.1 in one place: `integrations` sits above
 * `db` rather than beside it, because the phase plan has Phase 12
 * (integrations) depending on Phase 7 (the db repositories) — scrobble and
 * share both read tracks.
 */
const CRATE_RANKS: Readonly<Record<string, number>> = {
  core: 0,
  net: 1,
  audio: 1,
  'media-controls': 1,
  db: 2,
  serve: 2,
  metadata: 2,
  downloader: 3,
  library: 3,
  integrations: 3,
  recommendation: 4,
  // The composition root may reach for anything; nothing may reach for it.
  desktop: 99,
};

/** Normalizes Windows separators so path checks are separator-agnostic. */
function toPosix(file: string): string {
  return file.replace(/\\/gu, '/');
}

/**
 * Which crate a file belongs to, as the bare suffix used in `CRATE_RANKS`
 * (`crates/shiranami-db/src/x.rs` → `db`), or null when the file is outside
 * the ranked tree.
 */
function crateOf(file: string): string | null {
  const normalized = toPosix(file);

  const crateMatch = /\/crates\/shiranami-([a-z-]+)\//u.exec(normalized);
  if (crateMatch?.[1] !== undefined) {
    return crateMatch[1];
  }

  return normalized.includes('/apps/desktop-tauri/') ? 'desktop' : null;
}

/**
 * Strips block comments, line comments and blank lines, leaving only lines that
 * carry code. Doc comments (`//!`, `///`) are comments: a well-documented
 * module must not be penalized for it.
 */
function codeLines(source: string): number {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('//');
    }).length;
}

/**
 * The same source with comments removed, for the rules that scan for text.
 *
 * Every text scan in this file has to do this, and the reason is one the Rust
 * side already learned the hard way. `arch_guards.rs` records it: *"The scan
 * must strip comments, because this crate documents the very rules it bans; a
 * scan that flagged the documentation explaining a ban is the fastest way to get
 * a guard deleted."*
 *
 * It applies identically here. A module doc that explains why `shiranami-db`
 * must not reach into `shiranami-metadata` names both crates, and a doc comment
 * explaining where `#[tauri::command]` belongs has to spell the attribute. Both
 * read as violations to a scan over raw source, and both are the opposite: they
 * are the rule being written down where someone will find it.
 *
 * Full-line comments only, matching {@link codeLines}. A trailing comment on a
 * code line is left alone, because stripping it means deciding whether a `//`
 * sits inside a string literal — and getting that wrong silently deletes code
 * from the scan, which is a far worse failure than one over-reported line.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
}

/*
 * Item keywords that mean a file implements something rather than merely
 * declaring modules and re-exports. Matching on these rather than on an
 * allowlist of line shapes is what keeps the check honest: a multi-line `use`
 * group is unremarkable, but `fn` in a mod.rs never is. All are lowercase
 * keywords, so `pub use x::Type as Y;` is not a false positive.
 */
const NON_MANIFEST_ITEM = /\b(?:fn|struct|enum|union|trait|impl|const|static|type|macro_rules!)\b/u;

/** First line of a mod.rs that implements rather than declares, if any. */
function findImplementationLine(source: string): string | undefined {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .map(line => line.trim())
    .find(line => line !== '' && !line.startsWith('//') && NON_MANIFEST_ITEM.test(line));
}

/** Modules stay small, and `mod.rs` stays a manifest. */
export const rustModuleShapeRule: IMetaRule = {
  id: 'rust-module-shape',
  category: 'source-text',
  description: `Rust modules stay under ${String(MAX_CODE_LINES)} code lines, and mod.rs declares modules rather than implementing them.`,
  run({ rustFiles }: IMetaContext): IViolation[] {
    const violations: IViolation[] = [];

    for (const file of rustFiles) {
      const source = readFileSync(file, 'utf8');
      const lines = codeLines(source);

      if (lines > MAX_CODE_LINES) {
        violations.push({
          file,
          rule: 'rust-module-shape',
          message: `${String(lines)} code lines exceeds the ${String(MAX_CODE_LINES)}-line cap. In src-tauri this means logic belongs in a crate; in a crate it means the module has more than one job.`,
        });
      }

      if (basename(file) !== 'mod.rs') {
        continue;
      }

      const offender = findImplementationLine(source);

      if (offender !== undefined) {
        violations.push({
          file,
          rule: 'rust-module-shape',
          message: `mod.rs is a manifest: declarations and re-exports only, no implementation. Found: ${offender}`,
        });
      }
    }

    return violations;
  },
};

/** No crate may reach sideways or upward along the dependency spine. */
export const rustLayerRankRule: IMetaRule = {
  id: 'rust-layer-rank',
  category: 'source-text',
  description:
    'A crate may only depend on crates of a strictly lower rank in the dependency spine.',
  run({ rustFiles, rustManifests }: IMetaContext): IViolation[] {
    const violations: IViolation[] = [];

    const check = (file: string, referenced: string, source: 'use' | 'dependency'): void => {
      const own = crateOf(file);
      const ownRank = own === null ? undefined : CRATE_RANKS[own];
      const referencedRank = CRATE_RANKS[referenced];

      if (own === null || ownRank === undefined || referencedRank === undefined) {
        return;
      }
      if (own === referenced || referencedRank < ownRank) {
        return;
      }

      violations.push({
        file,
        rule: 'rust-layer-rank',
        message: `shiranami-${own} (rank ${String(ownRank)}) must not take a ${source} on shiranami-${referenced} (rank ${String(referencedRank)}). The spine runs downward only — invert the dependency or move the shared code down a rank.`,
      });
    };

    for (const file of rustFiles) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/\bshiranami_([a-z_]+)\b/gu)) {
        const referenced = match[1]?.replace(/_/gu, '-');
        if (referenced !== undefined) {
          check(file, referenced, 'use');
        }
      }
    }

    for (const file of rustManifests) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/^shiranami-([a-z-]+)\s*[=.]/gmu)) {
        const referenced = match[1];
        if (referenced !== undefined) {
          check(file, referenced, 'dependency');
        }
      }
    }

    return violations;
  },
};

/** Commands live in the command surface, not scattered through the shell. */
export const rustCommandPlacementRule: IMetaRule = {
  id: 'rust-command-placement',
  category: 'source-text',
  description: `#[tauri::command] may only appear under ${COMMANDS_DIR}.`,
  run({ rustFiles }: IMetaContext): IViolation[] {
    const violations: IViolation[] = [];

    for (const file of rustFiles) {
      const normalized = toPosix(file);
      if (normalized.includes(COMMANDS_DIR)) {
        continue;
      }

      if (/#\[(?:tauri::)?command\b/u.test(withoutComments(readFileSync(file, 'utf8')))) {
        violations.push({
          file,
          rule: 'rust-command-placement',
          message: `#[tauri::command] belongs in ${COMMANDS_DIR}<namespace>.rs, which is the file the generated bindings and the parity checklist are read from.`,
        });
      }
    }

    return violations;
  },
};
