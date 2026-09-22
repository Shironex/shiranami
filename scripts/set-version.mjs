#!/usr/bin/env node
/**
 * Stamps an explicit version across every release surface: the root
 * `package.json`, the desktop shell's `package.json` and `tauri.conf.json`, and
 * the Cargo workspace.
 *
 * This is the only version stamper. v1 kept its own (`bump-version.mjs` and
 * `set-version-ci.sh`) for the Electron line; both went with the Electron app
 * once v1.0.1 shipped as the final v1. `apps/web` and `packages/*` are not
 * stamped: the renderer asks the shell for its version, and the landing page
 * announces releases through its own `public/v2.json`.
 *
 * ## Cargo.lock
 *
 * Editing `[workspace.package] version` makes `Cargo.lock` stale for the
 * workspace's own crates. Nothing here rewrites it: the release build runs
 * without `--locked` so cargo refreshes those entries itself, and the result is
 * never committed.
 *
 * Usage: node scripts/set-version.mjs 2.0.0
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER_RE =
  /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

const JSON_TARGETS = [
  'package.json',
  'apps/desktop-tauri/package.json',
  'apps/desktop-tauri/src-tauri/tauri.conf.json',
];

const version = process.argv[2];

if (!version) {
  console.error('Usage: node scripts/set-version.mjs <version>');
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

console.log(`Release surfaces set to ${version}`);
