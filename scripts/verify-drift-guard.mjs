#!/usr/bin/env node
/**
 * Anti-vacuity proof for the binding regenerate-and-diff gate (architecture
 * §2.5, decision D7, risk R17).
 *
 * The gate itself is two steps: `cargo test -p shiranami-core` re-exports every
 * `#[derive(specta::Type)]` boundary type into `packages/contracts/src/generated/`,
 * then `git diff --exit-code` over that directory fails when the committed
 * bindings no longer match the Rust types.
 *
 * Nightcore's equivalent gate passed VACUOUSLY for its entire life (issue #422):
 * cargo resolves `.cargo/config.toml` by walking up from the current directory
 * rather than from `--manifest-path`, so a run from the repo root left
 * `TS_RS_EXPORT_DIR` unset, the generator wrote to a gitignored crate-default
 * directory, and the diff was clean because nothing had been written to the
 * guarded one. A guard that silently becomes a no-op once will do it again, so
 * this script proves it is still real:
 *
 *   1. perturb a `#[derive(specta::Type)]` type with a doc comment — specta
 *      emits it as JSDoc, so the generated `.ts` changes while Rust semantics
 *      and compilation do not,
 *   2. re-run the export the way the gate does,
 *   3. assert `git diff --exit-code` over the guarded directory now FAILS, and
 *      that the diff carries the probe marker,
 *   4. restore the source, re-export, and assert both are clean again.
 *
 * If step 3 sees a clean diff, the guard is a no-op and this exits 1.
 *
 * Run: `pnpm verify:drift-guard` (CI runs it in the `rust-checks` job).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRATE = path.join(ROOT, 'crates', 'shiranami-core');

/** The directory the real gate guards, repo-relative (as git pathspecs want it). */
const GENERATED = 'packages/contracts/src/generated';
/** The type we perturb, and the binding that must change when we do. */
const TARGET = 'crates/shiranami-core/src/models/folder.rs';
const TARGET_ANCHOR = 'pub struct WatchedFolder {';
const TARGET_BINDING = `${GENERATED}/core.ts`;
/** Scoped so the probe costs one incremental rebuild, not the whole suite. */
const EXPORT_TEST = 'bindings::tests::export_bindings';
const MARKER = 'shiranami-drift-guard-probe: this line must never be committed';

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

/**
 * Run the export exactly as the gate does. `cwd` is a parameter on purpose:
 * proving the result is identical from the repo root and from the crate
 * directory is what shows the export path is genuinely compile-time and not
 * resolved against the caller's working directory — the #422 defect itself.
 */
function runExport(cwd) {
  return spawnSync('cargo', ['test', '-p', 'shiranami-core', '--lib', EXPORT_TEST], {
    cwd,
    stdio: 'inherit',
  });
}

function fail(message) {
  console.error(`✖ drift-guard verification: ${message}`);
  process.exit(1);
}

// ── Pre-flight ──────────────────────────────────────────────────────────────
// This script writes to tracked files and restores them from disk, so it
// refuses to run over uncommitted work in those paths — a restore would
// otherwise discard someone's edits.
const dirty = git(['status', '--porcelain', '--', GENERATED, TARGET]).stdout.trim();
if (dirty !== '') {
  fail(
    `uncommitted changes under ${GENERATED} or ${TARGET} — commit or stash them first ` +
      `(this check mutates and restores those paths):\n${dirty}`
  );
}

// The diff half of the gate is only meaningful if the bindings are TRACKED. A
// .gitignore entry would make `git diff --exit-code` permanently clean — the
// same vacuity by another route.
if (git(['check-ignore', '-q', '--', GENERATED]).status === 0) {
  fail(`${GENERATED} is git-ignored — \`git diff --exit-code\` over it can never fail`);
}
const tracked = git(['ls-files', '--', GENERATED]).stdout.trim().split('\n').filter(Boolean);
if (tracked.length === 0) {
  fail(`no tracked files under ${GENERATED} — the gate would have nothing to diff`);
}
if (!tracked.includes(TARGET_BINDING)) {
  fail(`${TARGET_BINDING} is not tracked — point this script at another emitted file`);
}

// ── 0. The export must be cwd-independent ───────────────────────────────────
// #422 in one assertion: run the gate from two directories and require the same
// bytes. An env-derived or cwd-relative export path fails here.
console.log('drift-guard: exporting from the repo root and from the crate dir…');
if (runExport(ROOT).status !== 0) fail('the export failed when run from the repo root');
const fromRoot = readFileSync(path.join(ROOT, TARGET_BINDING), 'utf8');
if (runExport(CRATE).status !== 0) fail('the export failed when run from the crate directory');
const fromCrate = readFileSync(path.join(ROOT, TARGET_BINDING), 'utf8');
if (fromRoot !== fromCrate) {
  fail(
    'the export produced different output from the repo root than from the crate directory, ' +
      'so the export path depends on the caller’s cwd — this is nightcore #422 exactly'
  );
}
if (git(['diff', '--exit-code', '--', GENERATED]).status !== 0) {
  fail(
    `${GENERATED} is already dirty after a plain re-export — the committed bindings are stale. ` +
      `Run \`cargo test -p shiranami-core --lib bindings\` and commit the result.`
  );
}

// ── 1. Perturb a `#[derive(specta::Type)]` type ─────────────────────────────
const targetAbsolute = path.join(ROOT, TARGET);
const original = readFileSync(targetAbsolute, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(eol);
const anchor = lines.findIndex(line => line.trim().startsWith(TARGET_ANCHOR));
if (anchor === -1) {
  fail(
    `anchor \`${TARGET_ANCHOR}\` not found in ${TARGET} — the probe type was renamed or moved; ` +
      `point this script at another \`#[derive(specta::Type)]\` type`
  );
}
// Walk back over the item's attribute and doc-comment block so the marker lands
// at the TOP of the doc comment: a doc comment is a legal attribute anywhere in
// that block, and specta emits the whole block as one JSDoc.
let insertAt = anchor;
while (insertAt > 0) {
  const previous = lines[insertAt - 1]?.trim() ?? '';
  if (previous.startsWith('///') || previous.startsWith('#[')) insertAt -= 1;
  else break;
}
lines.splice(insertAt, 0, `/// ${MARKER}`);
writeFileSync(targetAbsolute, lines.join(eol));

let verdict = null;
try {
  // ── 2. Re-export with the perturbed type ──────────────────────────────────
  console.log(`drift-guard: perturbed ${TARGET}; re-running the export…`);
  if (runExport(ROOT).status !== 0) {
    verdict = 'the export run failed with the probe applied — cannot judge the guard';
  } else {
    // ── 3. The guard must now trip ──────────────────────────────────────────
    const diff = git(['diff', '--exit-code', '--', GENERATED]);
    if (diff.status === 0) {
      verdict =
        `the guard did NOT trip. The export ran with a changed \`#[derive(specta::Type)]\` type ` +
        `and \`git diff --exit-code -- ${GENERATED}\` still reported clean, so the drift gate ` +
        `is a no-op. This is nightcore #422 recurring.`;
    } else if (!git(['diff', '--', GENERATED]).stdout.includes(MARKER)) {
      verdict =
        `the guard tripped, but the diff does not carry the probe marker — it is reacting to ` +
        `something other than the perturbation, so this run proves nothing`;
    }
  }
} finally {
  // ── 4. Restore and re-verify ──────────────────────────────────────────────
  writeFileSync(targetAbsolute, original);
  if (runExport(ROOT).status !== 0) {
    console.error('drift-guard: WARNING — the restoring export failed; check your working tree');
  }
}

if (verdict !== null) fail(verdict);

const restored = git(['status', '--porcelain', '--', GENERATED, TARGET]).stdout.trim();
if (restored !== '') {
  fail(`the working tree was not restored cleanly:\n${restored}`);
}

console.log(
  '✔ drift-guard verification: the gate detected a perturbed type and the tree is clean again.'
);
