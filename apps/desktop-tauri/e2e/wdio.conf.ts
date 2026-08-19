/**
 * Ring 3 of §8's testing strategy: the E2E suite, on WebdriverIO.
 *
 * # Why wdio and not Playwright
 *
 * Playwright's `_electron.launch` has no Tauri equivalent, and `tauri-driver`
 * is Windows/Linux only because WKWebView exposes neither CDP nor a WebDriver
 * of its own. `@wdio/tauri-service`'s **embedded** provider is the only thing
 * that works on macOS: `tauri-plugin-wdio-webdriver`, compiled into the binary
 * behind the shell's `e2e` Cargo feature, *is* the WebDriver server, and the
 * service connects to it over `TAURI_WEBDRIVER_PORT` rather than driving an
 * external driver process. It is auto-detected on darwin, so `driverProvider`
 * is left unset.
 *
 * # Profiles are per capability, and that is the isolation boundary
 *
 * Tauri has no `--user-data-dir`. Both path resolvers — Tauri's
 * `app_data_dir()` via `dirs`, and `shiranami_core::paths` by hand — read
 * `$HOME` on macOS, so redirecting `HOME` relocates the v2 profile, the v1 tree
 * first-run continuity looks for, and `~/Music`. Each capability below gets its
 * own `HOME`, wiped once per run in `onPrepare`; specs within a capability
 * share it, which is what lets one spec assert on what a previous *process*
 * persisted.
 */

import fs from 'node:fs';
import path from 'node:path';

import { APP_BINARY, TMP_ROOT, REPO_ROOT } from './helpers/paths.js';
import { resetProfile, seedSettings, profileHome } from './helpers/profile.js';
import { stageV1Profile } from './helpers/v1-profile.js';

const isCi = Boolean(process.env.CI);

/**
 * The three profiles, and why there are exactly three.
 *
 * - `onboarding` runs **without** `SHIRANAMI_E2E`, because `App.tsx` treats the
 *   first-run wizard as complete when `IS_E2E` is true. That suppression is
 *   deliberate (v1 made the same choice so specs land on the app), but it means
 *   the only way to see a genuine cold boot is to not set the flag. Everything
 *   the wizard needs is UI, so losing the store registry there costs nothing.
 * - `library` is a settled install: onboarding done, empty database. The
 *   portable v1 scenarios live here.
 * - `migrated` starts as a v1 Electron profile and is what first-run continuity
 *   adopts on the first launch into it.
 */
const PROFILES = ['onboarding', 'library', 'migrated'] as const;

function envFor(name: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: profileHome(name),
    // v1's flag, and the switch behind three things this suite depends on:
    // `window.__SHIRANAMI_E2E__` (and so `electronAPI.__e2e`), the dynamic
    // import of the store registry in `main.tsx`, and §2.8 step 7's
    // suppression of the tray, Discord RPC, media controls and the updater.
    // `onboarding` overrides it to '0' below — it is the one capability that
    // wants the first-run wizard visible.
    SHIRANAMI_E2E: '1',
    // `shiranami_serve`'s served-request lines are DEBUG and the playback
    // scenario's proof signal; everything else stays at INFO so the file a
    // failure prints stays readable. `LOG_LEVEL`, not `RUST_LOG` — v1's
    // variable, kept.
    LOG_LEVEL: 'info,shiranami_serve=debug',
    ...extra,
  };
}

/** Options every capability shares. */
function serviceOptions(name: string, extra: Record<string, string> = {}) {
  return {
    appBinaryPath: APP_BINARY,
    env: envFor(name, extra),
    // The app's stderr, tagged `[Tauri:Backend]`, into the runner's output.
    // A boot refusal is an ERROR line there long before it is a timeout here.
    captureBackendLogs: true,
    backendLogLevel: 'info',
    // A debug build of a Tauri app with eleven crates behind it is not fast to
    // reach first paint on a cold page cache.
    startTimeout: 120_000,
  };
}

function capability(name: string, specs: string[], extra: Record<string, string> = {}) {
  return {
    browserName: 'tauri',
    'tauri:options': { application: APP_BINARY },
    'wdio:tauriServiceOptions': serviceOptions(name, extra),
    specs: specs.map(spec => path.join(REPO_ROOT, 'apps/desktop-tauri/e2e/specs', spec)),
    // Read back by `E2E_PROFILE` filtering below; wdio ignores unknown keys.
    'shiranami:profile': name,
  };
}

/**
 * Narrow the run to named profiles: `E2E_PROFILE=migrated`, or a comma list.
 *
 * # Why `--spec` alone is not enough
 *
 * wdio's `--spec` is a *global* filter: it replaces the spec list of **every**
 * capability rather than selecting the one that declared the file. So
 * `--spec shutdown.spec.ts` runs that file three times — once per profile —
 * and the two that were never meant to see it fail on a `before` hook. The
 * onboarding profile has no store registry to wait for (that is the point of
 * it), and the library profile has no migrated log to read, so both sit out
 * their timeouts and report failures that say nothing about the subject.
 *
 * Pairing the two — `E2E_PROFILE=migrated … --spec shutdown.spec.ts` — is what
 * makes "run this one spec" mean what it looks like it means. Unset, every
 * profile runs, which is what CI and a plain `pnpm test:e2e` do.
 */
function selectedCapabilities<T extends { 'shiranami:profile': string }>(all: T[]): T[] {
  const requested = process.env.E2E_PROFILE?.split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  if (requested === undefined || requested.length === 0) return all;

  const unknown = requested.filter(name => !all.some(cap => cap['shiranami:profile'] === name));
  if (unknown.length > 0) {
    throw new Error(
      `E2E_PROFILE names no such profile: ${unknown.join(', ')}. ` +
        `Known profiles: ${all.map(cap => cap['shiranami:profile']).join(', ')}.`
    );
  }

  return all.filter(cap => requested.includes(cap['shiranami:profile']));
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  tsConfigPath: path.join(REPO_ROOT, 'apps/desktop-tauri/e2e/tsconfig.json'),

  // One app at a time. The single-instance plugin is keyed off the profile, and
  // two apps sharing a `HOME` would race `shiranami.db`. Sequential also keeps
  // the interleaved backend logs readable, which is v1's stated reason too.
  maxInstances: 1,
  specFileRetries: isCi ? 1 : 0,

  capabilities: selectedCapabilities([
    capability('onboarding', ['cold-boot.spec.ts'], {
      // Explicitly absent rather than merely unset, so the reason is greppable:
      // SHIRANAMI_E2E would hide the wizard this capability exists to see.
      SHIRANAMI_E2E: '0',
    }),
    capability('library', [
      'smoke.spec.ts',
      'invoke-roundtrip.spec.ts',
      'library-scan.spec.ts',
      'playlist-crud.spec.ts',
      'favorites.spec.ts',
      'playback-store.spec.ts',
      'eq.spec.ts',
      'search.spec.ts',
    ]),
    capability('migrated', [
      'migrated-library.spec.ts',
      'playback-serve.spec.ts',
      // Last on purpose: it quits the app.
      'shutdown.spec.ts',
    ]),
  ]),

  services: [['tauri', {}]],

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    // A cold boot of a debug build plus a migration is not a 10-second test.
    timeout: 120_000,
  },

  reporters: ['spec'],
  logLevel: isCi ? 'info' : 'warn',
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,

  /**
   * Stage every profile before anything launches.
   *
   * Once per run, not per spec: the profiles are the fixtures, and rebuilding
   * one between spec files would throw away the cross-process persistence the
   * `library` capability's specs rely on.
   */
  onPrepare() {
    if (!fs.existsSync(APP_BINARY)) {
      throw new Error(
        `no app binary at ${APP_BINARY}.\n` +
          'Build it first: pnpm --filter @shiranami/desktop-tauri e2e:build\n' +
          '(the embedded WebDriver server is behind the `e2e` Cargo feature, so a ' +
          'plain `cargo build` produces a binary this suite cannot connect to).'
      );
    }

    for (const name of PROFILES) {
      resetProfile(name);
    }

    // A settled install: past onboarding, so the shell renders immediately.
    seedSettings(profileHome('library'), {
      'app.onboardingCompleted': true,
      'app.language': 'en',
      'app.telemetryEnabled': false,
    });

    // The migrated capability's v1 tree. Its audio lives outside the profile,
    // as a real user's would.
    stageV1Profile(profileHome('migrated'), path.join(TMP_ROOT, 'media', 'migrated'));

    // `onboarding` is left exactly as `resetProfile` made it: empty.
  },
};
