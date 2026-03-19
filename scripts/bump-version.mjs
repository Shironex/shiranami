#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const PACKAGE_FILES = [
  'package.json',
  'apps/desktop/package.json',
  'apps/landing/package.json',
  'apps/web/package.json',
  'packages/shared/package.json',
  'packages/database/package.json',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bumpType = args.find(a => ['patch', 'minor', 'major'].includes(a));

if (!bumpType) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major> [--dry-run]');
  process.exit(1);
}

function bump(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
  }
}

const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const currentVersion = rootPkg.version;
const newVersion = bump(currentVersion, bumpType);

console.log(`Bumping version: ${currentVersion} -> ${newVersion} (${bumpType})`);

if (dryRun) {
  console.log('\n[dry-run] Would update:');
  for (const file of PACKAGE_FILES) console.log(`  ${file}`);
  console.log(`\n[dry-run] Would create tag: v${newVersion}`);
  process.exit(0);
}

for (const file of PACKAGE_FILES) {
  const filePath = resolve(root, file);
  const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
  pkg.version = newVersion;
  writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  Updated ${file}`);
}

console.log('\nUpdating lockfile...');
execSync('pnpm install --lockfile-only', { cwd: root, stdio: 'inherit' });

const filesToStage = [...PACKAGE_FILES, 'pnpm-lock.yaml'].join(' ');
execSync(`git add ${filesToStage}`, { cwd: root });
execSync(`git commit -m "chore: bump version to ${newVersion}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag v${newVersion}`, { cwd: root });

console.log(`\nDone! Version bumped to ${newVersion}`);
console.log(`Tag v${newVersion} created.`);
console.log(`\nRun: git push origin master --tags`);
