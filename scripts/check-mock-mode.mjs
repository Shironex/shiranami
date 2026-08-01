#!/usr/bin/env node
/**
 * The mock-mode contract: `apps/web` must stay a usable browser app with no
 * backend attached (docs/v2/architecture.md §8 ring 4, risk R5).
 *
 * Two things depend on this and neither of them is obvious from the code:
 *
 *   - **Component testing survives the port.** macOS lost CDP-driven visual
 *     checks when the shell became a WKWebView, and browser mode plus Storybook
 *     are what replaced them. Both only work while the app boots without a
 *     backend.
 *   - **The shim stays inert.** `installElectronApiBridge()` returns early
 *     unless `__TAURI_INTERNALS__` is on `window`, and a great deal rests on
 *     that: Storybook installs its own `electronAPI` proxy and asserts
 *     `IS_ELECTRON === false`, and vitest's setup assigns a mock over a property
 *     the bridge would have defined non-writable. A bridge that installed
 *     unconditionally would break 229 story files and 22 test files at once, and
 *     `install.test.ts` can only prove that in jsdom.
 *
 * So this drives the real dev server in a real browser and asserts what jsdom
 * cannot: the app renders, every view navigates, nothing throws, and
 * `window.electronAPI` is still absent when the last view has painted.
 *
 * Usage:
 *
 *   pnpm check:mock-mode                            # starts the dev server itself
 *   MOCK_MODE_URL=http://localhost:4173/ pnpm check:mock-mode   # or reuse one
 *
 * Note the port: the architecture doc says `:5173` in §2.6/§8, but the web app
 * has always been on **15175** (`apps/web/vite.config.ts`, and `devUrl` in
 * `tauri.conf.json`). 15175 is the real target.
 */
import { spawn } from 'node:child_process';

const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = await import(PW);

/** Where the app is. Provide it to reuse an already-running server. */
const EXTERNAL_URL = process.env.MOCK_MODE_URL ?? null;
const URL = EXTERNAL_URL ?? 'http://localhost:15175/';

/** Views worth walking — mirrors NAV_ITEMS in Sidebar.tsx and screenshot-app.mjs. */
const VIEWS = [
  'library',
  'playlists',
  'favorites',
  'history',
  'mixes',
  'search',
  'import-playlist',
  'radio',
  'settings',
];

/**
 * Console errors that are the browser being a browser rather than the app being
 * broken. Keep this list short and keep every entry explained — an allowlist is
 * where a real regression goes to hide.
 */
const ALLOWED_CONSOLE = [
  // No backend means no art, no audio and no weather. Failed subresource loads
  // and aborted fetches are the empty path working, not failing.
  /Failed to load resource/i,
  /net::ERR_/,
  /ERR_CONNECTION_REFUSED/,
];

const failures = [];

/** Wait for the dev server to answer, or give up. */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer within ${String(timeoutMs)}ms`);
}

/** Start `pnpm dev:web`, unless the caller pointed us at a running server. */
async function startServer() {
  if (EXTERNAL_URL) {
    await waitForServer(URL, 30_000);
    return { stop() {} };
  }

  const child = spawn('pnpm', ['dev:web'], { stdio: ['ignore', 'ignore', 'inherit'] });
  await waitForServer(URL, 120_000);
  return {
    stop() {
      child.kill();
    },
  };
}

const server = await startServer();
const browser = await chromium.launch();

try {
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() === 'error' && !ALLOWED_CONSOLE.some(rule => rule.test(message.text()))) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', error => {
    pageErrors.push(String(error?.stack ?? error));
  });

  // A fresh profile lands on the first-run wizard, which has no sidebar and so
  // no views to walk. `IS_E2E` is not usable as the bypass here — it is
  // `IS_ELECTRON && electronAPI.__e2e`, and the absence of `electronAPI` is the
  // very thing under test — so seed the store the wizard reads instead. This is
  // the persisted shape of `useOnboardingStore` (`shiranami.onboarding`, v1).
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'shiranami.onboarding',
      JSON.stringify({ state: { hasCompletedOnboarding: true }, version: 1 })
    );
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // The app shell paints from the guarded empty path, with no backend at all.
  try {
    await page.locator('[data-view="library"]').first().waitFor({ timeout: 30_000 });
  } catch {
    failures.push(
      'the app shell never rendered — no [data-view="library"] appeared within 30s. ' +
        'In browser mode every query hook takes its IS_ELECTRON empty path, so a ' +
        'blank screen here means something now requires a backend to boot.'
    );
  }

  // The contract itself.
  const environment = await page.evaluate(() => ({
    tauriInternals: '__TAURI_INTERNALS__' in window,
    electronApi: 'electronAPI' in window,
    rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
  }));

  if (environment.tauriInternals) {
    failures.push(
      '__TAURI_INTERNALS__ is present in a plain browser, so this run did not ' +
        'test mock mode at all'
    );
  }
  if (environment.electronApi) {
    failures.push(
      'window.electronAPI is defined in browser mode. installElectronApiBridge() ' +
        'must return early when __TAURI_INTERNALS__ is absent: Storybook installs ' +
        'its own proxy and asserts IS_ELECTRON === false, and vitest assigns its ' +
        'mock over a property the bridge defines non-writable.'
    );
  }
  if (environment.rootChildren === 0) {
    failures.push('#root has no children — the app mounted nothing');
  }

  // Walk the views. This is what exercises the guarded empty paths.
  for (const view of VIEWS) {
    const button = page.locator(`[data-view="${view}"]`).first();
    try {
      await button.waitFor({ timeout: 5_000 });
      await button.click();
      await page.waitForTimeout(400);
    } catch (error) {
      failures.push(`view "${view}" did not navigate: ${error.message}`);
    }
  }

  // Re-check after the walk: a lazily-imported chunk installing the bridge late
  // would pass the check above and still break Storybook.
  const stillInert = await page.evaluate(() => !('electronAPI' in window));
  if (!stillInert) {
    failures.push('window.electronAPI appeared after navigating — the bridge installs lazily');
  }

  for (const error of pageErrors) {
    failures.push(`uncaught page error: ${error}`);
  }
  for (const error of consoleErrors) {
    failures.push(`console error: ${error}`);
  }
} finally {
  await browser.close();
  server.stop();
}

if (failures.length > 0) {
  console.error(`\nmock-mode contract FAILED (${String(failures.length)}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `\nmock-mode contract holds: the shell booted with no backend, ${String(VIEWS.length)} views ` +
    'walked clean, and window.electronAPI stayed absent throughout.'
);
