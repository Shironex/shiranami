import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../..');

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close: () => Promise<void>;
}

export interface LaunchOptions {
  /** Reuse an existing userData dir (used by settings-persistence-across-restart specs). */
  userDataDir?: string;
  /** Extra env vars merged on top of the default e2e env. */
  env?: Record<string, string>;
}

/**
 * Linux-CI Electron flags. Required because:
 * - The default Electron setuid sandbox isn't usable inside generic Linux
 *   runner containers / xvfb sessions — without --no-sandbox the GPU/renderer
 *   processes spawn but never finish init and `firstWindow()` times out.
 * - /dev/shm is often only 64 MB on runners; --disable-dev-shm-usage routes
 *   Chrome's shm-backed allocations to /tmp instead, preventing OOM-style
 *   renderer crashes.
 * - GPU acceleration through xvfb is unavailable; --disable-gpu skips the
 *   GPU process bring-up that would otherwise hang waiting for a real driver.
 *
 * Applied on Linux only — macOS/Windows e2e runs use the real WM and have
 * working sandboxing, so we keep the production defaults there.
 */
const LINUX_CI_FLAGS =
  process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : [];

/**
 * How many trailing Electron output lines to fold into a boot-failure error.
 * The main process logs its bootstrap banner (~10 lines) before anything can
 * fail, so 40 comfortably covers the banner plus the stack that killed it.
 */
const BOOT_LOG_TAIL_LINES = 40;

/**
 * Ceiling for the renderer-ready gate below. Steady-state boot is ~4 s; a
 * window that has not exposed the preload bridge in 15 s is wedged, not slow,
 * and the surrounding 25 s test timeout still gets a chance to report.
 */
const RENDERER_READY_TIMEOUT_MS = 15_000;

/**
 * Turn an opaque launch failure into something a CI log reader can act on:
 * whether the main process died or merely never showed a window, plus the tail
 * of everything it printed on the way down.
 */
function describeBootFailure(
  error: unknown,
  exitDescription: string | null,
  bootLog: string[]
): Error {
  const causeMessage = error instanceof Error ? error.message : String(error);
  const what = exitDescription
    ? `Electron exited before the renderer was ready (${exitDescription}).`
    : 'Electron never produced a ready renderer window.';
  const output =
    bootLog.length > 0
      ? `Last Electron output:\n${bootLog.join('\n')}`
      : 'Electron printed nothing — check that apps/desktop/dist is built.';
  return new Error(`${what}\n${causeMessage}\n\n${output}`);
}

/**
 * Boot the packaged Electron app in e2e mode with an isolated userData dir.
 *
 * Each call mints a fresh tmpdir unless one is supplied (for restart specs).
 * SHIRANAMI_E2E disables tray/Discord-RPC/auto-updater/media-controls so the
 * window is the only side-effect; the renderer still reaches the production
 * preload bundle so window.electronAPI behaves exactly as users see it.
 */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? mkdtempSync(path.join(tmpdir(), 'shiranami-e2e-'));
  const ownsDir = !options.userDataDir;

  const app = await electron.launch({
    args: [APP_ROOT, `--user-data-dir=${userDataDir}`, ...LINUX_CI_FLAGS],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SHIRANAMI_E2E: '1',
      SHIRANAMI_E2E_SKIP_DOWNLOAD: '1',
      // Force Electron to disable its sandbox at the bootstrap level too —
      // belt and braces alongside the --no-sandbox CLI flag.
      ELECTRON_DISABLE_SANDBOX: process.platform === 'linux' ? '1' : '',
      // Make Electron noisy on stderr so a silent boot hang in CI leaves
      // diagnosable evidence. We always pipe stderr to the spec runner's
      // stderr below; in headed/dev runs the duplication is harmless.
      ELECTRON_ENABLE_LOGGING: '1',
      ELECTRON_ENABLE_STACK_DUMPING: '1',
      ...options.env,
    },
    timeout: 20_000,
  });

  // Tee Electron's stderr into the Playwright runner's stderr so any failure
  // beyond firstWindow() timeout leaves real diagnostics in the CI log, and
  // keep a rolling tail so the same diagnostics can ride along on the thrown
  // error. Playwright reports a dead main process as a bare "Target page,
  // context or browser has been closed" pinned to whichever spec happened to
  // request the fixture first — without the tail that message is unactionable.
  const proc = app.process();
  const bootLog: string[] = [];
  const tee = (prefix: string) => (chunk: Buffer) => {
    const text = chunk.toString();
    process.stderr.write(`${prefix} ${text}`);
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue;
      bootLog.push(line);
      if (bootLog.length > BOOT_LOG_TAIL_LINES) bootLog.shift();
    }
  };
  proc.stderr?.on('data', tee('[electron]'));
  proc.stdout?.on('data', tee('[electron:out]'));

  // bootstrap() calls reportBootFailure() on any rejection, which under
  // SHIRANAMI_E2E exits the process instead of raising a modal. That exit is
  // the single most common way these specs die (a native module built for the
  // wrong ABI, a failed migration), so record the code and name it explicitly.
  let exitDescription: string | null = null;
  proc.once('exit', (code, signal) => {
    exitDescription = code !== null ? `exit code ${code}` : `signal ${signal}`;
  });

  let page: Page;
  try {
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // createMainWindow() does not await loadFile(), so firstWindow() can
    // resolve on the pre-navigation blank document — whose load state is
    // already complete, making waitForLoadState() a no-op that returns before
    // the renderer exists. Gate on the preload bridge instead: it is the first
    // thing the real document exposes and every spec's opening page.evaluate()
    // reaches through it.
    await page.waitForFunction(() => Boolean(window.electronAPI), undefined, {
      timeout: RENDERER_READY_TIMEOUT_MS,
    });
  } catch (error) {
    // The fixture never got to hand this app to a spec, so its close() will
    // never run — reap the process here or it outlives the whole run. The
    // userData dir is deliberately left behind: the main-process log file
    // inside it is the post-mortem.
    await app.close().catch(() => {});
    throw describeBootFailure(error, exitDescription, bootLog);
  }

  return {
    app,
    page,
    userDataDir,
    close: async () => {
      try {
        await app.close();
      } catch {
        /* already gone */
      }
      if (ownsDir) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    },
  };
}
