import { scrubEvent } from '@shiranami/shared';
import { isTauri } from '@/lib/bridge/environment';

// Type-only imports — erased at build, so they never pull the SDK into the
// eager bundle. The actual SDK is dynamically imported inside
// `initSentryRenderer`, after the consent check passes.
type SentryReact = typeof import('@sentry/react');
type CaptureException = SentryReact['captureException'];
type BrowserOptions = import('@sentry/react').BrowserOptions;
type TransportFactory = NonNullable<BrowserOptions['transport']>;
type TransportRequestExecutor = Parameters<SentryReact['createTransport']>[1];

let initialized = false;

// Lazily populated once the SDK loads. Until then `captureException` below is a
// no-op, which is the correct behavior pre-consent: nothing is reported.
let sdkCaptureException: CaptureException | null = null;

/**
 * Local-test escape hatch, mirroring the Rust side's `SENTRY_FORCE_ENABLE`.
 * When `VITE_SENTRY_FORCE_ENABLE` is `true`, an unpackaged dev build is allowed
 * to init Sentry. It overrides ONLY the production check — consent is still
 * required, and the Rust side must be force-enabled too or it never registers
 * the plugin the transport below talks to.
 */
const forceEnabled = import.meta.env.VITE_SENTRY_FORCE_ENABLE === 'true';

/**
 * The browser SDK refuses to start a client without a DSN, but nothing is ever
 * sent to it: {@link makeTauriTransport} hands every envelope to the Rust
 * client, which owns the real DSN, release, environment and dist.
 */
const PLACEHOLDER_DSN = 'https://public@tauri.invalid/0';

const SENTRY_ENVELOPE_COMMAND = 'plugin:sentry|envelope';

// Matches the IPC request Tauri makes for the plugin's own commands, on both
// the `ipc://localhost/…` (macOS) and `http://ipc.localhost/…` (Windows) forms.
const SENTRY_IPC_URL = /plugin(?::|%3A)sentry(?:\||%7C)/i;

function isSentryIpcUrl(url: unknown): boolean {
  return typeof url === 'string' && SENTRY_IPC_URL.test(url);
}

/**
 * Route envelopes to `tauri-plugin-sentry`'s `envelope` command, so renderer
 * events are captured by the Rust client — the Tauri equivalent of
 * `@sentry/electron`'s renderer → main IPC transport. The Rust side re-scrubs
 * through `core::scrub` and applies its own release/environment.
 *
 * The plugin is registered only when consent, a packaged build and a compiled
 * DSN all agreed at launch, so the command is absent otherwise (e.g. consent
 * turned on this session — it takes effect on next launch). The first failure
 * stops all further sends instead of retrying into a command that cannot exist.
 */
function makeTauriTransport(
  createTransport: SentryReact['createTransport'],
  invoke: typeof import('@tauri-apps/api/core').invoke
): TransportFactory {
  let ipcFailed = false;

  return options => {
    const send: TransportRequestExecutor = async request => {
      if (ipcFailed) return { statusCode: 200 };
      // A binary body (attachments) has to cross the JSON IPC as a plain array
      // to deserialize into the plugin's `Vec<u8>`.
      const envelope = typeof request.body === 'string' ? request.body : Array.from(request.body);
      try {
        await invoke(SENTRY_ENVELOPE_COMMAND, { envelope });
      } catch {
        ipcFailed = true;
      }
      // Rate limiting and delivery belong to the Rust client.
      return { statusCode: 200 };
    };
    return createTransport(options, send);
  };
}

/**
 * Initialize Sentry in the renderer. Gated identically to the Rust side: only
 * runs after explicit opt-in, only in a production build (or when
 * force-enabled for local testing), and only inside the Tauri webview. The
 * DSN/release/environment are the Rust client's — the renderer never needs its
 * own DSN.
 *
 * The SDK is dynamically imported here, AFTER the gates pass, so a normal
 * launch (no consent, or not a production build) never parses it.
 *
 * Idempotent: a guard makes repeat calls a no-op, so the Privacy "Send test
 * event" button can safely call this to ensure init when consent was toggled
 * on after the boot-time call in main.tsx already returned early.
 *
 * `@sentry/react`'s init wires the React error boundary + component
 * instrumentation. No replay integration is added.
 */
export async function initSentryRenderer(): Promise<void> {
  if (initialized) return;
  if (!isTauri() || !(import.meta.env.PROD || forceEnabled)) return;

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
    { init, browserTracingIntegration, captureException: sdkCapture, createTransport },
    { invoke },
  ] = await Promise.all([import('@sentry/react'), import('@tauri-apps/api/core')]);

  // Mirror the Rust side: sample everything on an unpackaged dev build, a
  // modest rate on shipped builds, and nothing when performance monitoring is
  // off. browserTracing is only wired when tracing is actually enabled.
  const tracesSampleRate = perfEnabled ? (import.meta.env.PROD ? 0.2 : 1.0) : 0;

  init({
    dsn: PLACEHOLDER_DSN,
    transport: makeTauriTransport(createTransport, invoke),
    sendDefaultPii: false,
    tracesSampleRate,
    // App sessions are the Rust client's to track, as they were the Electron
    // main process's; a browser session here would double-count every launch.
    integrations: defaults => [
      ...defaults.filter(integration => integration.name !== 'BrowserSession'),
      ...(perfEnabled
        ? [browserTracingIntegration({ shouldCreateSpanForRequest: url => !isSentryIpcUrl(url) })]
        : []),
    ],
    // Sending an envelope is itself an IPC fetch; keep it out of the trail.
    beforeBreadcrumb: breadcrumb => (isSentryIpcUrl(breadcrumb.data?.url) ? null : breadcrumb),
    beforeSend: event => scrubEvent(event),
  });

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
