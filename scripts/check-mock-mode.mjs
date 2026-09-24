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
 *   node scripts/check-mock-mode.mjs --self-test    # only the server-guard checks
 *
 * Note the port: the architecture doc says `:5173` in §2.6/§8, but the web app
 * has always been on **15175** (`apps/web/vite.config.ts`, and `devUrl` in
 * `tauri.conf.json`). 15175 is the real target.
 */
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

// The guard that stops the dev server is checked before it is trusted with one.
await selfTest();
if (process.argv.includes('--self-test')) {
  console.log('check-mock-mode self-test: OK');
  process.exit(0);
}

const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = await import(PW);

/** Where the app is. Provide it to reuse an already-running server. */
const EXTERNAL_URL = process.env.MOCK_MODE_URL ?? null;
const URL = EXTERNAL_URL ?? 'http://localhost:15175/';

/** Views worth walking — mirrors NAV_ITEMS in Sidebar.tsx. */
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

  // `pnpm` is a `.cmd` shim on Windows, which only a shell can start. The shell
  // also means `child` is the shell, not vite, so stopping it has to take the
  // whole tree (see `killTree`).
  const isWindows = process.platform === 'win32';
  const child = spawn('pnpm', ['dev:web'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: true,
    detached: !isWindows,
  });
  const guard = guardChild(child, { isWindows });
  await untilReady(guard, waitForServer(URL, 120_000));
  return guard;
}

/**
 * Stop a whole process tree: by PID with taskkill on Windows, by process group
 * elsewhere (the child is spawned detached, so it leads its own group).
 */
function killTree(pid, isWindows) {
  if (isWindows) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    /* the group is already gone */
  }
}

/**
 * Tie a started server's tree to this script's life.
 *
 * A detached tree does not die with its parent, so Ctrl+C or a CI cancel would
 * leave vite holding the port, and the next run's `waitForServer` would happily
 * test that stale server. So SIGINT and SIGTERM stop the tree first and then
 * exit with the conventional code (128 + signal number). The handlers exist only
 * while the child does: they are added here, at spawn, and removed by `stop()`
 * or when the child exits on its own. Nothing is killed by PID once the child
 * has exited, because Windows reuses PIDs and the number may name a stranger.
 */
function guardChild(child, { isWindows, proc = process, kill = killTree }) {
  const handlers = new Map();
  let stopped = false;
  const release = () => {
    for (const [signal, handler] of handlers) proc.off(signal, handler);
    handlers.clear();
  };
  // Latched: the kill is asynchronous, so a second call can land before the
  // child's exit event, and must not reach for the PID again.
  const stop = () => {
    release();
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null) kill(child.pid, isWindows);
  };

  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const handler = () => {
      stop();
      proc.exit(code);
    };
    handlers.set(signal, handler);
    proc.on(signal, handler);
  }
  child.once('exit', release);

  return { stop };
}

/** Wait for the server; if it never comes up, take the tree down before failing. */
async function untilReady(guard, ready) {
  try {
    await ready;
  } catch (error) {
    guard.stop();
    throw error;
  }
}

/**
 * `guardChild` and `untilReady` against fake processes: no server, no browser,
 * a few milliseconds. Runs before every check, and alone with `--self-test`.
 */
async function selfTest() {
  const check = (condition, message) => {
    if (!condition) throw new Error(`check-mock-mode self-test: ${message}`);
  };
  const guarded = () => {
    const proc = new EventEmitter();
    proc.exitCodes = [];
    proc.exit = code => proc.exitCodes.push(code);
    const child = new EventEmitter();
    Object.assign(child, { pid: 4242, exitCode: null, signalCode: null });
    const kills = [];
    const guard = guardChild(child, {
      isWindows: true,
      proc,
      kill: pid => kills.push(pid),
    });
    const listening = () => proc.listenerCount('SIGINT') + proc.listenerCount('SIGTERM');
    return { proc, child, kills, guard, listening };
  };

  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const { proc, kills, listening } = guarded();
    check(listening() === 2, 'SIGINT and SIGTERM handlers are registered when the child starts');
    proc.emit(signal);
    check(kills.join() === '4242', `${signal} stops the server tree`);
    check(proc.exitCodes.join() === String(code), `${signal} exits with ${String(code)}`);
    check(listening() === 0, `${signal} releases the handlers`);
  }

  {
    const { kills, guard, listening } = guarded();
    guard.stop();
    guard.stop();
    check(kills.length === 1, 'a normal stop kills the tree once');
    check(listening() === 0, 'a normal stop removes the handlers');
  }

  {
    const { proc, child, kills, guard, listening } = guarded();
    child.exitCode = 1;
    child.emit('exit', 1);
    check(listening() === 0, 'the handlers go when the child exits on its own');
    guard.stop();
    proc.emit('SIGINT');
    check(kills.length === 0, 'nothing is killed by PID after the child has exited');
  }

  {
    const { kills, guard, listening } = guarded();
    const failed = await untilReady(guard, Promise.reject(new Error('never came up'))).then(
      () => false,
      () => true
    );
    check(failed, 'a failed startup still fails');
    check(kills.length === 1 && listening() === 0, 'a failed startup stops the tree');
  }
}

const server = await startServer();
let browser;

try {
  browser = await chromium.launch();
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

  // Showcase mode (`?showcase=1`) must cost a plain dev session nothing beyond
  // its small install seam: the demo library is only ever reached through the
  // flag, so none of its fixture modules may be requested here.
  const showcaseRequests = [];
  page.on('request', request => {
    if (request.url().includes('/lib/showcase/fixtures/')) showcaseRequests.push(request.url());
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

  const showcaseActive = await page.evaluate(() => document.documentElement.dataset.showcase);
  if (showcaseActive !== undefined) {
    failures.push('showcase mode switched itself on without ?showcase=1');
  }
  for (const url of showcaseRequests) {
    failures.push(`a showcase fixture module loaded without ?showcase=1: ${url}`);
  }

  // Both arrays hold strings already rendered at capture time — the page-error
  // handler keeps the full stack, which is richer than the `.message` the
  // no-error-stringify rule steers toward. Named for what they hold, not `error`.
  for (const stack of pageErrors) {
    failures.push(`uncaught page error: ${stack}`);
  }
  for (const text of consoleErrors) {
    failures.push(`console error: ${text}`);
  }
} finally {
  await browser?.close();
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
