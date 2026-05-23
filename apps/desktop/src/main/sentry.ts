import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { scrubEvent, scrubBreadcrumb } from '@shiranami/shared';
import { store } from './store';
import { logger } from './logger';

/**
 * Build-time-injected DSN. esbuild replaces `__SENTRY_DSN__` with
 * `JSON.stringify(process.env.SENTRY_DSN ?? '')` (see esbuild.config.mjs).
 * When absent at build time it falls back to `process.env.SENTRY_DSN` at
 * runtime, so the local-test command can inject the DSN through the shell
 * without rebuilding. When both are absent this is an empty string and
 * `Sentry.init` is skipped — no crash, no egress.
 */
declare const __SENTRY_DSN__: string;
const SENTRY_DSN: string =
  (typeof __SENTRY_DSN__ === 'string' ? __SENTRY_DSN__ : '') || process.env.SENTRY_DSN || '';

/**
 * Local-test escape hatch. When `SENTRY_FORCE_ENABLE` is `true`/`1` in the
 * shell env, an unpackaged dev build is allowed to init Sentry so the first
 * event can be sent during onboarding. It overrides ONLY the packaged check —
 * consent and a DSN are still required. Has no effect on packaged builds.
 */
const forceEnabled =
  process.env.SENTRY_FORCE_ENABLE === 'true' || process.env.SENTRY_FORCE_ENABLE === '1';

let initialized = false;

/**
 * True only when the user has explicitly opted in AND the build is packaged
 * (or the force-enable escape hatch is set for local testing). Dev builds
 * never report unless force-enabled, and a fresh install never reports
 * (consent defaults to false / undefined).
 */
function shouldInit(): boolean {
  return store.get('app.telemetryEnabled') === true && (app.isPackaged || forceEnabled);
}

/**
 * Initialize Sentry in the main process. Idempotent and gated: returns early
 * unless consent is on, the build is packaged (or SENTRY_FORCE_ENABLE is set
 * for local testing), and a DSN is available. Must be called BEFORE the app
 * 'ready' event (see index.ts) — @sentry/electron registers protocol/IPC
 * handlers at init that Electron only permits pre-ready.
 */
export function initSentryMain(): void {
  if (initialized) return;

  if (!shouldInit()) {
    logger.info(
      '[telemetry] disabled — consent off, or unpackaged build without SENTRY_FORCE_ENABLE'
    );
    return;
  }

  if (!SENTRY_DSN) {
    logger.info('[telemetry] consent on but no DSN injected — skipping init');
    return;
  }

  // Performance tracing is a separate opt-in: only sample transactions when the
  // user has also enabled performance monitoring. Sample everything on an
  // unpackaged dev build (the developer hunting bottlenecks); keep a modest
  // rate on shipped builds to bound transaction volume across many users.
  const perfEnabled = store.get('app.performanceMonitoringEnabled') === true;
  const tracesSampleRate = perfEnabled ? (app.isPackaged ? 0.2 : 1.0) : 0;

  Sentry.init({
    dsn: SENTRY_DSN,
    release: `shiranami@${app.getVersion()}`,
    // Force-enabled local runs are unpackaged — tag them 'development' so they
    // don't pollute the production environment's error rates and dashboards.
    environment: app.isPackaged ? 'production' : 'development',
    dist: process.platform,
    sendDefaultPii: false,
    tracesSampleRate,
    beforeSend: event => scrubEvent(event),
    beforeBreadcrumb: breadcrumb => scrubBreadcrumb(breadcrumb),
  });

  initialized = true;
  logger.info(
    `[telemetry] enabled — Sentry initialized (main), performance monitoring ${
      perfEnabled ? 'on' : 'off'
    }`
  );
}

/**
 * Runtime consent toggle. Turning OFF flushes and closes the client immediately
 * so no further events are sent. Turning ON cannot init the SDK at runtime —
 * @sentry/electron must initialize before the app 'ready' event — so enabling
 * takes effect on the next launch, when the boot-time gate picks up the flag.
 */
export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    if (initialized) return;
    // Enabling while the app is already running can't init now (the SDK must
    // init pre-ready). The persisted consent flag takes effect on next launch.
    if (app.isReady()) {
      logger.info('[telemetry] consent enabled — crash reporting starts on next launch');
      return;
    }
    initSentryMain();
    return;
  }

  if (initialized) {
    try {
      await Sentry.close(2000);
    } catch {
      // Closing is best-effort; the gate still blocks future inits on restart.
    }
    initialized = false;
    logger.info('[telemetry] disabled — Sentry client closed (main)');
  }
}

/**
 * Wire the runtime toggle to the persisted consent flag. When the renderer
 * flips `app.telemetryEnabled` through the gated store IPC, the main process
 * reacts here — no dedicated IPC channel needed. Returns the unsubscribe fn.
 */
export function watchTelemetryConsent(): () => void {
  return store.onDidChange('app.telemetryEnabled', value => {
    void setTelemetryEnabled(value === true);
  });
}
