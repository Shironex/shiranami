import * as SentryElectron from '@sentry/electron/renderer';
import { init as reactInit } from '@sentry/react';
import { scrubEvent } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';

/**
 * Initialize Sentry in the renderer. Gated identically to the main process:
 * only runs after explicit opt-in, only in a packaged/production build, and
 * only inside Electron. The DSN/release/environment are inherited from the
 * main process via the @sentry/electron IPC transport — the renderer never
 * needs its own DSN.
 *
 * `@sentry/electron/renderer`'s init forwards through @sentry/react's init so
 * the React error boundary + component instrumentation are wired up while
 * events still route to the main transport. No replay integration is added.
 */
export async function initSentryRenderer(): Promise<void> {
  if (!IS_ELECTRON || !import.meta.env.PROD) return;

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
}

/** Re-export the renderer capture surface for the ErrorBoundary. */
export const captureException = SentryElectron.captureException;
