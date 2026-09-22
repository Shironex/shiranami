/**
 * Run the E2E suite one profile at a time.
 *
 * `wdio.conf.ts` accepts exactly one profile per process, because the tauri
 * service spawns every capability's app up front and the apps cannot coexist
 * (see `requiredProfile` there). This loops over them in the order the config
 * declares, keeps going past a failure so one broken profile does not hide the
 * others, and exits non-zero if any failed.
 *
 * `E2E_PROFILE` set narrows the loop to that one; extra arguments (`--spec …`)
 * pass through to wdio.
 */

import { spawnSync } from 'node:child_process';

// Mirrors `PROFILES` in wdio.conf.ts; the config rejects any name it lacks.
const ALL = ['onboarding', 'library', 'migrated'];

const profiles = process.env.E2E_PROFILE ? [process.env.E2E_PROFILE] : ALL;
const failed = [];

for (const profile of profiles) {
  console.log(`\n=== e2e profile: ${profile} ===\n`);
  const { status } = spawnSync('wdio', ['run', 'e2e/wdio.conf.ts', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, E2E_PROFILE: profile },
  });
  if (status !== 0) failed.push(profile);
}

if (failed.length > 0) {
  console.error(`\ne2e failed for: ${failed.join(', ')}`);
  process.exitCode = 1;
}
