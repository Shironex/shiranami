#!/usr/bin/env node
/**
 * Attach to a running Shiranami Electron app via CDP and screenshot every
 * top-level view in every supported UI language.
 *
 * Pre-req: launch the app with the renderer + main both reachable via CDP, e.g.
 *
 *   pnpm dev:web                                                # terminal 1
 *   cd apps/desktop && pnpm exec electron . --remote-debugging-port=9222  # terminal 2
 *
 * Output: assets/screenshots/<lang>/<view>.png
 */
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = await import(PW);
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const OUT_ROOT = resolve(process.cwd(), 'assets/screenshots');

// Keep in sync with apps/web/src/lib/i18n.ts
const LANGUAGE_STORAGE_KEY = 'shiranami.language';
const UI_LANGUAGE_SETTING_KEY = 'app.language';
const UI_STORE_KEY = 'shiranami.app-store';
const LANGUAGES = (process.env.LANGS ?? 'en,pl')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Views worth capturing — mirrors NAV_ITEMS in Sidebar.tsx.
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

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
const page =
  context.pages().find(p => p.url().startsWith('http://localhost:15175')) ??
  context.pages().find(p => !p.url().startsWith('devtools://'));

if (!page) {
  console.error(
    'no renderer page found on CDP — is the app running with --remote-debugging-port=9222?'
  );
  process.exit(1);
}

console.log('attached to:', page.url(), '·', await page.title());

async function waitForReady() {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-view="library"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function setLanguage(lang) {
  console.log(`\n── switching UI to "${lang}" ─────────────────────`);
  await page.evaluate(
    async ({ lang, lsKey, storeKey }) => {
      window.localStorage.setItem(lsKey, lang);
      try {
        await window.electronAPI?.store?.set?.(storeKey, lang);
      } catch {
        // best-effort — localStorage drives the boot
      }
    },
    { lang, lsKey: LANGUAGE_STORAGE_KEY, storeKey: UI_LANGUAGE_SETTING_KEY }
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady();
}

// Per-view post-navigate settle. Radio fetches the station list and lazy-loads
// favicons — give it real time to render before the shutter.
const EXTRA_WAIT = {
  radio: 5_000,
  history: 1_500,
  mixes: 1_500,
};

async function navigate(viewId) {
  const btn = page.locator(`[data-view="${viewId}"]`).first();
  await btn.waitFor({ timeout: 5_000 });
  await btn.click();
  // Lazy chunks + view fade-in — wait a beat before the shot.
  await page.waitForTimeout(900);
  if (EXTRA_WAIT[viewId]) {
    await page.waitForTimeout(EXTRA_WAIT[viewId]);
  }
}

async function shot(lang, view) {
  const dir = resolve(OUT_ROOT, lang);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${view}.png`);
  await page.screenshot({ path: file });
  console.log('  ->', file);
}

await waitForReady();

// Temporarily reveal every nav item in the sidebar so we can screenshot
// views the user has hidden. Restore after the run.
const originalUIStore = await page.evaluate(key => {
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? JSON.parse(raw) : null;
  const next = parsed ? JSON.parse(JSON.stringify(parsed)) : { state: {}, version: 0 };
  next.state = next.state ?? {};
  next.state.sidebarHiddenItems = [];
  // Collapse sidebar for cleaner screenshots — restored after the run.
  next.state.sidebarCollapsed = true;
  window.localStorage.setItem(key, JSON.stringify(next));
  return parsed;
}, UI_STORE_KEY);

try {
  // Reload so the cleared sidebarHiddenItems takes effect immediately.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady();

  for (const lang of LANGUAGES) {
    await setLanguage(lang);
    for (const view of VIEWS) {
      try {
        await navigate(view);
        await shot(lang, view);
      } catch (e) {
        console.warn(`  skip ${lang}/${view}:`, e.message);
      }
    }
  }
} finally {
  await page.evaluate(
    ({ key, value }) => {
      if (value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: UI_STORE_KEY, value: originalUIStore }
  );
  console.log('\nrestored original UI store.');
}

// Disconnect — do NOT close the page, that would kill Electron.
await browser.close();
console.log('\ndone.');
