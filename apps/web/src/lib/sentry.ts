import * as SentryElectron from '@sentry/electron/renderer';
import { init as reactInit } from '@sentry/react';
import { scrubEvent } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';

let initialized = false;

/**
 * Local-test escape hatch, mirroring the main process. When
 * `VITE_SENTRY_FORCE_ENABLE` is `true`, an unpackaged dev build is allowed to
 * init Sentry. Vite exposes `VITE_`-prefixed vars from both `.env` files and
 * `process.env`, so the local-test command can set it via the shell. It
 * overrides ONLY the production check — consent is still required.
 */
const forceEnabled = import.meta.env.VITE_SENTRY_FORCE_ENABLE === 'true';

/**
 * Initialize Sentry in the renderer. Gated identically to the main process:
 * only runs after explicit opt-in, only in a packaged/production build (or
 * when force-enabled for local testing), and only inside Electron. The
 * DSN/release/environment are inherited from the main process via the
 * @sentry/electron IPC transport — the renderer never needs its own DSN.
 *
 * Idempotent: a guard makes repeat calls a no-op, so the Privacy "Send test
 * event" button can safely call this to ensure init when consent was toggled
 * on after the boot-time call in main.tsx already returned early.
 *
 * `@sentry/electron/renderer`'s init forwards through @sentry/react's init so
 * the React error boundary + component instrumentation are wired up while
 * events still route to the main transport. No replay integration is added.
 */
export async function initSentryRenderer(): Promise<void> {
  if (initialized) return;
  if (!IS_ELECTRON || !(import.meta.env.PROD || forceEnabled)) return;

  let consent: boolean;
  try {
    consent = (await window.electronAPI.store.get('app.telemetryEnabled')) === true;
  } catch {
    // Store read failed — treat as no consent.
    return;
  }
  if (!consent) return;

  SentryElectron.init(
    {
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      integrations: [SentryElectron.browserTracingIntegration()],
      beforeSend: event => scrubEvent(event),
    },
    reactInit
  );

  initialized = true;
}

/** Re-export the renderer capture surface for the ErrorBoundary. */
export const captureException = SentryElectron.captureException;
