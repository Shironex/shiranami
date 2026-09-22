#!/usr/bin/env node
/**
 * Stamps an explicit version across v2's release surfaces.
 *
 * ## Why this is not `bump-version.mjs`, and not `set-version-ci.sh`
 *
 * Those two own the *v1* version line: root `package.json`, `apps/desktop`,
 * `apps/landing`, `apps/web`, `packages/*`. That line is at 1.x and keeps
 * moving — architecture §4.4 commits to ~6 months of v1 patches *after* v2
 * ships, so for the whole handover window the two versions are independent and
 * a shared stamper would drag one along with the other. A v1.0.1 patch release
 * must not set the Rust workspace to 1.0.1.
 *
 * Phase 20 collapses the two lines when `desktop-tauri` is renamed to `desktop`
 * and the Electron app is deleted; this file is what gets folded into the other
 * two at that point, not before.
 *
 * ## Cargo.lock
 *
 * Editing `[workspace.package] version` makes `Cargo.lock` stale for the
 * workspace's own crates. Nothing here rewrites it: the release build runs
 * without `--locked` so cargo refreshes those entries itself, and the result is
 * never committed.
 *
 * Usage: node scripts/set-version-v2.mjs 2.0.0
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER_RE =
  /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

const JSON_TARGETS = [
  'apps/desktop-tauri/package.json',
  'apps/desktop-tauri/src-tauri/tauri.conf.json',
];

const version = process.argv[2];

if (!version) {
  console.error('Usage: node scripts/set-version-v2.mjs <version>');
  process.exit(1);
}

if (!SEMVER_RE.test(version)) {
  console.error(`Error: '${version}' is not a valid semver version`);
  process.exit(1);
}

for (const target of JSON_TARGETS) {
  const path = resolve(root, target);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  parsed.version = version;
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`  Updated ${target}`);
}

// Anchored to the `[workspace.package]` header so this can only ever touch that
// one `version =`. A bare replace would hit the first pinned dependency that
// happens to spell its version on its own line.
const cargoPath = resolve(root, 'Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');
const workspacePackage = /(\[workspace\.package\][^[]*?\nversion = ")[^"]*(")/;

if (!workspacePackage.test(cargo)) {
  console.error('Error: could not find [workspace.package] version in Cargo.toml');
  process.exit(1);
}

writeFileSync(cargoPath, cargo.replace(workspacePackage, `$1${version}$2`));
console.log(`  Updated ${relative(root, cargoPath)}`);

console.log(`v2 release surfaces set to ${version}`);
