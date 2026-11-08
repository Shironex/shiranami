#!/usr/bin/env node
/*
 * Runs expo-doctor and fails on every failed check except the ones listed in
 * KNOWN_FAILURES. expo-doctor has no switch for the Hermes V1 check, and the
 * only fix is Expo SDK 57, so that one check is tolerated by name until the
 * upgrade. Everything else, including new failures, still fails the run.
 * Run with `pnpm check:expo`.
 */
const { spawnSync } = require('node:child_process');

const KNOWN_FAILURES = [
  // Fixed only by Expo SDK 57 / React Native 0.86.2. Delete this entry with
  // the SDK upgrade.
  'Check for Expo SDK versions affected by Hermes V1 regressions',
];

const bin = require.resolve('expo-doctor/build/index.js');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  encoding: 'utf8',
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.error) {
  console.error(`expo-doctor did not run: ${result.error.message}`);
  process.exit(1);
}

const failed = (result.stdout ?? '')
  .split('\n')
  .filter((line) => line.startsWith('✖ '))
  .map((line) => line.slice(2).trim());

if (failed.length === 0) {
  process.exit(result.status === 0 ? 0 : 1);
}

const unexpected = failed.filter((name) => !KNOWN_FAILURES.includes(name));
if (unexpected.length > 0) {
  console.error(`\nexpo-doctor: unexpected failed checks:\n- ${unexpected.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nexpo-doctor: tolerated known failure(s): ${failed.join('; ')}`);
