import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { scrubEvent, scrubBreadcrumb } from '@shiranami/shared';
import { store } from './store';
import { logger } from './logger';

/**
 * Build-time-injected DSN. esbuild replaces `__SENTRY_DSN__` with
 * `JSON.stringify(process.env.SENTRY_DSN ?? '')` (see esbuild.config.mjs).
 * When the env var is absent (local dev, or CI without the secret) this is an
 * empty string and `Sentry.init` is skipped — no crash, no egress.
 */
declare const __SENTRY_DSN__: string;
const SENTRY_DSN: string = typeof __SENTRY_DSN__ === 'string' ? __SENTRY_DSN__ : '';

let initialized = false;

/**
 * True only when the user has explicitly opted in AND the build is packaged.
 * Dev builds never report (keeps the project free of dev noise) and a fresh
 * install never reports (consent defaults to false / undefined).
 */
function shouldInit(): boolean {
  return store.get('app.telemetryEnabled') === true && app.isPackaged;
}

/**
 * Initialize Sentry in the main process. Idempotent and gated: returns early
 * unless consent is on, the build is packaged, and a DSN was injected. Call at
 * the very top of bootstrap() so even early crashes are captured once enabled.
 */
export function initSentryMain(): void {
  if (initialized) return;

  if (!shouldInit()) {
    logger.info('[telemetry] disabled — consent off or unpackaged build');
    return;
  }

  if (!SENTRY_DSN) {
    logger.info('[telemetry] consent on but no DSN injected — skipping init');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: `shiranami@${app.getVersion()}`,
    environment: 'production',
    dist: process.platform,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: event => scrubEvent(event),
    beforeBreadcrumb: breadcrumb => scrubBreadcrumb(breadcrumb),
  });

  initialized = true;
  logger.info('[telemetry] enabled — Sentry initialized (main)');
}

/**
 * Runtime consent toggle. Turning ON in a packaged build initializes Sentry
 * immediately; turning OFF flushes and closes the client so no further events
 * are sent. A restart cleanly re-applies the gate either way.
 */
export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
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
