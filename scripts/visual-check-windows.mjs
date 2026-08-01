#!/usr/bin/env node
/**
 * CDP-driven visual checks against the live Tauri renderer, on Windows.
 *
 * ## Why this is Windows-only
 *
 * v1 drove visual checks by launching Electron with `--remote-debugging-port=9222`
 * and attaching Playwright over CDP (`scripts/screenshot-app.mjs`). That workflow
 * dies on macOS in v2: WKWebView has no CDP and never will. It survives on
 * Windows, because WebView2 is Chromium and accepts `--remote-debugging-port`
 * through the webview's additional browser arguments (architecture §8, risk R5).
 *
 * macOS keeps component-level coverage through `pnpm check:mock-mode` and
 * Storybook instead. This script is the Windows half of that split.
 *
 * ## !! NOT YET RUN ON WINDOWS !!
 *
 * Everything below was written and reviewed on macOS, where only `--print-config`
 * can execute. The CDP attach, the WebView2 argument plumbing and the view walk
 * need their first real run on a Windows machine before the CI job that calls
 * them is made required. `.github/workflows/visual-windows.yml` is gated on
 * `workflow_dispatch` and a label for exactly that reason.
 *
 * ## How the browser arguments get in
 *
 * `tauri.conf.json` declares the main window statically, so Tauri builds the
 * webview during `Builder::build()` and there is no `WebviewWindowBuilder` in
 * `lib.rs` to hang `with_additional_browser_args` on. The supported seam is the
 * config: `app.windows[].additionalBrowserArgs`. Rather than hand-maintain a
 * second copy of the window object — RFC 7386 merge replaces arrays wholesale,
 * so a partial overlay would silently drop the title, size and decorations —
 * this script *derives* the overlay from the real config at run time. There is
 * nothing to keep in sync.
 *
 * Note the footgun §2.7 records: `additionalBrowserArgs` **replaces** wry's
 * default `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`
 * rather than appending to it, so the defaults are re-included below. That is
 * also where Phase 13's SMTC suppression flag belongs when it lands — see
 * `MEDIA_SESSION_SUPPRESSION`.
 *
 * Usage:
 *
 *   node scripts/visual-check-windows.mjs --print-config   # runs anywhere
 *   pnpm visual:windows                                    # Windows only
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve(process.cwd(), 'apps/desktop-tauri/src-tauri/tauri.conf.json');
const OUT_ROOT = resolve(process.cwd(), 'test-results/visual-windows');
const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const CDP_URL = process.env.CDP_URL ?? `http://127.0.0.1:${String(CDP_PORT)}`;

/**
 * wry's defaults. `additionalBrowserArgs` replaces them, so dropping any of
 * these re-enables WebView2's mini-menu and SmartScreen inside the app.
 */
const WRY_DEFAULT_DISABLED = ['msWebOOUI', 'msPdfOOUI', 'msSmartScreenProtection'];

/**
 * Architecture §2.7 / risk R4: the flag that stops the Windows SMTC flyout
 * showing "Microsoft Edge WebView2" instead of Shiranami. It is **not** applied
 * here — this script only builds an inspection config, and turning it on in a
 * debug-only path would leave the shipped app without it. When Phase 13 wires
 * souvlaki, add it to `tauri.conf.json`'s own `additionalBrowserArgs` and route
 * both through {@link browserArgs}, which is the "one place, two uses" §2.7 asks
 * for.
 */
export const MEDIA_SESSION_SUPPRESSION = 'MediaSessionService';

/** The full `additionalBrowserArgs` string for a CDP-enabled run. */
export function browserArgs({ cdpPort }) {
  return [
    `--disable-features=${WRY_DEFAULT_DISABLED.join(',')}`,
    `--remote-debugging-port=${String(cdpPort)}`,
    // Chromium refuses the CDP websocket handshake without this. v1 hit the
    // same wall — see apps/desktop's dev:inspect script.
    '--remote-allow-origins=*',
  ].join(' ');
}

/**
 * The real config with CDP arguments injected into the main window.
 *
 * Derived, never hand-written: `--config` is an RFC 7386 merge patch, and that
 * replaces arrays rather than merging them, so the overlay has to carry the
 * whole window object or the window loses everything the base config gave it.
 */
export function inspectConfig(base, args) {
  const windows = (base.app?.windows ?? []).map((window, index) =>
    index === 0 ? { ...window, additionalBrowserArgs: args } : window
  );
  return { app: { windows } };
}

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

const base = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const overlay = inspectConfig(base, browserArgs({ cdpPort: CDP_PORT }));

if (process.argv.includes('--print-config')) {
  console.log(JSON.stringify(overlay, null, 2));
  process.exit(0);
}

if (process.platform !== 'win32' && process.env.VISUAL_FORCE !== '1') {
  console.error(
    `visual-check-windows: WebView2 CDP exists only on Windows; this is ${process.platform}.\n` +
      'macOS component coverage lives in `pnpm check:mock-mode` and Storybook (architecture R5).\n' +
      'Use --print-config to inspect the derived Tauri config from any platform.'
  );
  process.exit(1);
}

const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = await import(PW);

const overlayPath = resolve(tmpdir(), 'shiranami-tauri-inspect.conf.json');
writeFileSync(overlayPath, JSON.stringify(overlay, null, 2));

/** Wait until the WebView2 CDP endpoint answers. */
async function waitForCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${CDP_URL}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      /* the app is still starting */
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(
    `no CDP endpoint on ${CDP_URL} within ${String(timeoutMs)}ms. ` +
      'WebView2 only opens one when additionalBrowserArgs reaches it — check that ' +
      'the derived config was actually passed (--print-config shows what we send).'
  );
}

const app = spawn(
  'pnpm',
  ['--filter', '@shiranami/desktop-tauri', 'exec', 'tauri', 'dev', '--config', overlayPath],
  { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' }
);

const failures = [];
let browser = null;

try {
  // A Tauri dev run compiles the Rust workspace first; on a cold CI runner that
  // is minutes, not seconds.
  await waitForCdp(Number(process.env.CDP_TIMEOUT_MS ?? 900_000));

  browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  // Dev serves the UI from vite; a packaged build serves it from tauri.localhost.
  const page =
    context.pages().find(p => p.url().startsWith('http://localhost:15175')) ??
    context.pages().find(p => p.url().includes('tauri.localhost')) ??
    context.pages().find(p => !p.url().startsWith('devtools://'));

  if (!page) {
    throw new Error('no renderer page found on CDP — the webview exposed no attachable target');
  }

  console.log('attached to:', page.url(), '·', await page.title());

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') {
      consoleErrors.push(m.text());
    }
  });
  page.on('pageerror', e => pageErrors.push(String(e?.stack ?? e)));

  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-view="library"]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);

  mkdirSync(OUT_ROOT, { recursive: true });

  for (const view of VIEWS) {
    const button = page.locator(`[data-view="${view}"]`).first();
    try {
      await button.waitFor({ timeout: 5_000 });
      await button.click();
      await page.waitForTimeout(900);
      const file = resolve(OUT_ROOT, `${view}.png`);
      await page.screenshot({ path: file });
      console.log('  ->', file);
    } catch (error) {
      failures.push(`view "${view}" did not render: ${error.message}`);
    }
  }

  for (const error of pageErrors) {
    failures.push(`uncaught page error: ${error}`);
  }
  for (const error of consoleErrors) {
    failures.push(`console error: ${error}`);
  }
} finally {
  // Disconnect only — closing the pages would take the app down mid-teardown.
  if (browser) {
    await browser.close();
  }
  app.kill();
}

if (failures.length > 0) {
  console.error(`\nwindows visual check FAILED (${String(failures.length)}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`\nwindows visual check passed: ${String(VIEWS.length)} views captured to ${OUT_ROOT}`);
