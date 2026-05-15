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
      ...options.env,
    },
    timeout: 20_000,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

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
