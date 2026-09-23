import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserOptions } from '@sentry/react';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(() => 'event-id'),
  browserTracingIntegration: vi.fn((options?: unknown) => ({ name: 'BrowserTracing', options })),
  createTransport: vi.fn(
    (_options: unknown, send: (request: { body: string | Uint8Array }) => Promise<unknown>) => ({
      send,
    })
  ),
}));
const tauri = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));

vi.mock('@sentry/react', () => sdk);
vi.mock('@tauri-apps/api/core', () => tauri);

const TAURI_GLOBAL = '__TAURI_INTERNALS__';
const USERNAME = 'alice';

type Sentry = typeof import('./sentry');

/** A fresh module per test, so the `initialized` guard never leaks between them. */
async function loadSentry(): Promise<Sentry> {
  vi.resetModules();
  return import('./sentry');
}

function consent(telemetry: unknown, performance: unknown = false): void {
  vi.mocked(window.electronAPI.store.get).mockImplementation(async (key: string) => {
    if (key === 'app.telemetryEnabled') return telemetry;
    if (key === 'app.performanceMonitoringEnabled') return performance;
    return undefined;
  });
}

function initOptions(): BrowserOptions {
  expect(sdk.init).toHaveBeenCalledTimes(1);
  return sdk.init.mock.calls[0]![0] as BrowserOptions;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, TAURI_GLOBAL, { value: {}, configurable: true });
  vi.stubEnv('PROD', true);
});

afterEach(() => {
  Reflect.deleteProperty(window, TAURI_GLOBAL);
  vi.unstubAllEnvs();
});

describe('initSentryRenderer — gates', () => {
  it('does not init without consent', async () => {
    consent(undefined);
    const { initSentryRenderer, captureException } = await loadSentry();

    await initSentryRenderer();

    expect(sdk.init).not.toHaveBeenCalled();
    expect(captureException(new Error('boom'))).toBe('');
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('treats an explicit false and a truthy non-boolean as no consent', async () => {
    for (const value of [false, 'true', 1]) {
      consent(value);
      const { initSentryRenderer } = await loadSentry();
      await initSentryRenderer();
    }

    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('does not init when the consent read fails', async () => {
    vi.mocked(window.electronAPI.store.get).mockRejectedValue(new Error('ipc down'));
    const { initSentryRenderer } = await loadSentry();

    await initSentryRenderer();

    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('does not init outside the Tauri webview, even with consent', async () => {
    Reflect.deleteProperty(window, TAURI_GLOBAL);
    consent(true);
    const { initSentryRenderer } = await loadSentry();

    await initSentryRenderer();

    expect(sdk.init).not.toHaveBeenCalled();
    expect(window.electronAPI.store.get).not.toHaveBeenCalled();
  });

  it('does not init in a development build, even with consent', async () => {
    vi.stubEnv('PROD', false);
    consent(true);
    const { initSentryRenderer } = await loadSentry();

    await initSentryRenderer();

    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('lets VITE_SENTRY_FORCE_ENABLE lift only the production clause', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_SENTRY_FORCE_ENABLE', 'true');

    consent(false);
    await (await loadSentry()).initSentryRenderer();
    expect(sdk.init).not.toHaveBeenCalled();

    consent(true);
    await (await loadSentry()).initSentryRenderer();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });
});

describe('initSentryRenderer — with consent', () => {
  it('inits once, without default PII, and wires captureException', async () => {
    consent(true);
    const { initSentryRenderer, captureException } = await loadSentry();

    await initSentryRenderer();
    await initSentryRenderer();

    const options = initOptions();
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(captureException(new Error('boom'))).toBe('event-id');
  });

  it('scrubs home paths out of every event before it is sent', async () => {
    consent(true);
    await (await loadSentry()).initSentryRenderer();

    const event = {
      message: `crash in /Users/${USERNAME}/app/index.js`,
      exception: {
        values: [
          {
            value: `ENOENT: C:\\Users\\${USERNAME}\\Music\\a.flac`,
            stacktrace: { frames: [{ filename: `/home/${USERNAME}/app/renderer.js` }] },
          },
        ],
      },
    };
    const beforeSend = initOptions().beforeSend!;
    const scrubbed = await beforeSend(event as never, {});

    expect(JSON.stringify(scrubbed)).not.toContain(USERNAME);
    expect(scrubbed?.message).toBe('crash in ~/app/index.js');
  });

  it('drops BrowserSession and adds no tracing when performance is off', async () => {
    consent(true, false);
    await (await loadSentry()).initSentryRenderer();

    const integrations = initOptions().integrations as (
      defaults: { name: string }[]
    ) => { name: string }[];
    const names = integrations([{ name: 'BrowserSession' }, { name: 'Dedupe' }]).map(i => i.name);

    expect(names).toEqual(['Dedupe']);
    expect(sdk.browserTracingIntegration).not.toHaveBeenCalled();
  });

  it('adds browser tracing at the shipped sample rate when performance is on', async () => {
    consent(true, true);
    await (await loadSentry()).initSentryRenderer();

    const options = initOptions();
    const integrations = options.integrations as (defaults: { name: string }[]) => {
      name: string;
    }[];

    expect(options.tracesSampleRate).toBe(0.2);
    expect(integrations([]).map(i => i.name)).toEqual(['BrowserTracing']);
  });

  it('routes envelopes to the Rust client through the sentry plugin', async () => {
    consent(true);
    await (await loadSentry()).initSentryRenderer();

    const factory = initOptions().transport as unknown as (options: unknown) => {
      send: (request: { body: string | Uint8Array }) => Promise<unknown>;
    };
    const transport = factory({});

    await expect(transport.send({ body: 'envelope' })).resolves.toEqual({ statusCode: 200 });
    await transport.send({ body: new Uint8Array([1, 2]) });

    expect(tauri.invoke).toHaveBeenNthCalledWith(1, 'plugin:sentry|envelope', {
      envelope: 'envelope',
    });
    expect(tauri.invoke).toHaveBeenNthCalledWith(2, 'plugin:sentry|envelope', {
      envelope: [1, 2],
    });
  });

  it('stops sending after the plugin is found missing', async () => {
    consent(true);
    tauri.invoke.mockRejectedValueOnce(new Error('plugin sentry not found'));
    await (await loadSentry()).initSentryRenderer();

    const factory = initOptions().transport as unknown as (options: unknown) => {
      send: (request: { body: string }) => Promise<unknown>;
    };
    const transport = factory({});

    await transport.send({ body: 'first' });
    await transport.send({ body: 'second' });

    expect(tauri.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps its own IPC traffic out of breadcrumbs', async () => {
    consent(true);
    await (await loadSentry()).initSentryRenderer();

    const beforeBreadcrumb = initOptions().beforeBreadcrumb!;
    const own = { category: 'fetch', data: { url: 'ipc://localhost/plugin%3Asentry%7Cenvelope' } };
    const other = { category: 'fetch', data: { url: 'http://ipc.localhost/db_tracks_get_all' } };

    expect(beforeBreadcrumb(own)).toBeNull();
    expect(beforeBreadcrumb(other)).toBe(other);
  });
});
