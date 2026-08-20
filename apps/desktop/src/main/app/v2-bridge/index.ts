/**
 * The dormant v2 handover bridge.
 *
 * Shiranami v2 is a Tauri app. `electron-updater` expects electron-builder
 * metadata (`latest.yml`, `.blockmap`, its own NSIS) and cannot install a Tauri
 * artifact — there is no supported hand-off mode. The documented failure here
 * is shipping v1.x releases *without* a bridge and then discovering, months
 * later, that the tail never crossed over because it never opened the app
 * during the transition window. So the hook ships first and sleeps.
 *
 * **The dormant guarantee.** Everything below hangs off exactly one condition:
 *
 *     const artifact = manifest && resolveHandover(manifest);
 *     if (!artifact) return;   // ← nothing else in this module runs
 *
 * `fetchV2Manifest()` returns `null` for every failure mode (404, offline, DNS,
 * timeout, oversized, non-JSON, schema-invalid) and never throws;
 * `resolveHandover()` returns `null` when the kill switch is off, the
 * `min_v1_version` floor is not met, or this platform has no artifact. Until a
 * manifest is published, the entire cost of this feature is one 5-second-capped
 * GET per hour, off the startup path, and one log line per process.
 */

import * as Sentry from '@sentry/electron/main';
import { app, type BrowserWindow } from 'electron';
import { logger } from '../logger';
import { store } from '../store';
import { INITIAL_UPDATE_CHECK_DELAY_MS, UPDATE_CHECK_INTERVAL_MS } from '../updater';
import { CROSSOVER_PINGED_KEY, hasManifestUrlOverride } from './constants';
import { writeHandoffFiles } from './handoff';
import { runWindowsHandover, showHandoverNotice } from './handover';
import { fetchV2Manifest, resolveHandover, type V2Manifest } from './manifest';

/** What a single bridge tick decided. Returned for tests and logging only. */
export type V2BridgeOutcome =
  | 'dormant'
  | 'not-applicable'
  | 'already-surfaced'
  | 'handed-off'
  | 'notified';

let initialized = false;
let surfacedThisSession = false;
let checkInFlight = false;
const timers: NodeJS.Timeout[] = [];

/**
 * One-time crossover ping so the v1 tail is measured rather than guessed.
 * Gated on the same explicit opt-in as every other Sentry event — when consent
 * is off this is a no-op and the flag stays unset.
 */
function pingCrossover(manifest: V2Manifest): void {
  try {
    if (store.get(CROSSOVER_PINGED_KEY) === true) return;
    if (store.get('app.telemetryEnabled') !== true) return;

    Sentry.captureMessage('v2-crossover', {
      level: 'info',
      tags: {
        v1_version: app.getVersion(),
        v2_version: manifest.version,
        platform: process.platform,
      },
    });
    store.set(CROSSOVER_PINGED_KEY, true);
  } catch (error) {
    logger.warn('[v2-bridge] Crossover ping failed:', error);
  }
}

/**
 * One bridge tick. Never throws — a handover failure degrades to the manual
 * notice, and a manifest failure degrades to doing nothing at all.
 */
export async function checkForV2Handover(
  mainWindow: BrowserWindow | null
): Promise<V2BridgeOutcome> {
  if (surfacedThisSession || checkInFlight) return 'already-surfaced';
  checkInFlight = true;

  try {
    const manifest = await fetchV2Manifest();
    if (!manifest) return 'dormant';

    const artifact = resolveHandover(manifest);
    if (!artifact) return 'not-applicable';

    logger.info(`[v2-bridge] Handover manifest is live for v${manifest.version}`);
    pingCrossover(manifest);
    await writeHandoffFiles(mainWindow);

    // Only a packaged Windows build can install over itself; anything else
    // (macOS, Linux, an unpackaged run) gets the manual notice.
    if (process.platform === 'win32' && app.isPackaged) {
      surfacedThisSession = true;
      if (await runWindowsHandover(artifact)) return 'handed-off';
      logger.warn('[v2-bridge] Automatic handover failed — falling back to the manual notice');
      await showHandoverNotice(mainWindow, manifest, artifact);
      return 'notified';
    }

    surfacedThisSession = true;
    await showHandoverNotice(mainWindow, manifest, artifact);
    return 'notified';
  } catch (error) {
    // Defence in depth: every callee already swallows its own failures.
    logger.warn('[v2-bridge] Handover check failed:', error);
    return 'dormant';
  } finally {
    checkInFlight = false;
  }
}

/**
 * Schedule the bridge poll on the same cadence as the updater's own check.
 *
 * It does NOT ride inside `initializeAutoUpdater`, because that function
 * returns early on macOS (unsigned, no updater) — and macOS users are exactly
 * the ones who need the manual notice. Timers are `unref`'d so the poll never
 * holds the event loop open.
 */
export function initializeV2Bridge(mainWindow: BrowserWindow | null, isDev: boolean): void {
  if (initialized) return;

  // Dev builds stay quiet unless a test manifest URL is pointed at them.
  if (isDev && !hasManifestUrlOverride()) {
    logger.info('[v2-bridge] Skipping handover bridge in development mode');
    return;
  }

  initialized = true;

  const tick = (): void => {
    void checkForV2Handover(mainWindow);
  };

  timers.push(setTimeout(tick, INITIAL_UPDATE_CHECK_DELAY_MS).unref());
  timers.push(setInterval(tick, UPDATE_CHECK_INTERVAL_MS).unref());
}

/** Cancel the bridge timers (app teardown, and between tests). */
export function stopV2Bridge(): void {
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  timers.length = 0;
  initialized = false;
  surfacedThisSession = false;
  checkInFlight = false;
}
