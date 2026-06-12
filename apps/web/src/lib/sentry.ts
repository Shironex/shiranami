import { scrubEvent } from '@shiranami/shared';
import { IS_ELECTRON } from '@/lib/platform';

// Type-only imports — erased at build, so they never pull the SDK into the
// eager bundle. The actual SDK is dynamically imported inside
// `initSentryRenderer`, after the consent check passes.
type SentryRenderer = typeof import('@sentry/electron/renderer');
type CaptureException = SentryRenderer['captureException'];

let initialized = false;

// Lazily populated once the SDK loads. Until then `captureException` below is a
// no-op, which is the correct behavior pre-consent: nothing is reported.
let sdkCaptureException: CaptureException | null = null;

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
 * The SDK (~216 KB source) is dynamically imported here, AFTER the gates pass,
 * so a normal launch (no consent, or not a packaged build) never parses it.
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
  let perfEnabled: boolean;
  try {
    consent = (await window.electronAPI.store.get('app.telemetryEnabled')) === true;
    // Performance tracing is a separate opt-in (sub-option of telemetry).
    perfEnabled = (await window.electronAPI.store.get('app.performanceMonitoringEnabled')) === true;
  } catch {
    // Store read failed — treat as no consent.
    return;
  }
  if (!consent) return;

  // Only now that consent is confirmed do we pull the SDK into the page. Pull
  // the bindings by name rather than as a namespace so the bundler can drop the
  // barrel's unused Replay/Feedback re-exports.
  const [
    { init: sentryInit, browserTracingIntegration, captureException: sdkCapture },
    { init: reactInit },
  ] = await Promise.all([import('@sentry/electron/renderer'), import('@sentry/react')]);

  // Mirror the main process: sample everything on an unpackaged dev build, a
  // modest rate on shipped builds, and nothing when performance monitoring is
  // off. browserTracing is only wired when tracing is actually enabled.
  const tracesSampleRate = perfEnabled ? (import.meta.env.PROD ? 0.2 : 1.0) : 0;

  sentryInit(
    {
      sendDefaultPii: false,
      tracesSampleRate,
      integrations: perfEnabled ? [browserTracingIntegration()] : [],
      beforeSend: event => scrubEvent(event),
    },
    reactInit
  );

  sdkCaptureException = sdkCapture;
  initialized = true;
}

/**
 * Renderer capture surface for the ErrorBoundary and global handlers. A no-op
 * until the SDK is loaded (i.e. until consent was given and init ran), so it is
 * always safe to call synchronously without dragging the SDK into the eager
 * bundle. Returns the Sentry event id, or an empty string when not yet active.
 */
export const captureException: CaptureException = (exception, hint) => {
  return sdkCaptureException?.(exception, hint) ?? '';
};
