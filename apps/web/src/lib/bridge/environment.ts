/**
 * The three facts the shim has to answer synchronously, before React mounts.
 *
 * `@/lib/platform` reads `window.electronAPI.platform` and `.__e2e` at module
 * scope and freezes both into constants, so neither can be a promise: an async
 * answer would arrive after 325 `IS_ELECTRON` reads have already been decided.
 * That constraint is what picks each implementation below.
 *
 * Nothing here may import `@/lib/platform`, directly or transitively. The
 * install seam runs before it precisely so that `IS_ELECTRON` sees an installed
 * bridge, and an import cycle would invert that.
 */

/**
 * Whether the renderer is running inside the Tauri webview.
 *
 * `__TAURI_INTERNALS__` is injected by the webview itself before any page
 * script runs, so this is true from the first line of the first module. The
 * `withGlobalTauri` config flag is deliberately not relied on: it controls
 * `window.__TAURI__`, which is a convenience global the app does not enable.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * The `process.platform` string v1's preload exposed, inferred from the webview.
 *
 * v1 read it from Node and was exact. There is no synchronous equivalent here:
 * `tauri-plugin-os` would answer, but registering it is Phase 16's and its
 * `platform()` is only synchronous once the plugin has injected its own
 * internals global — which is the same ordering problem one rung down. The user
 * agent is available on the first line and distinguishes the only three values
 * `IS_WINDOWS` and `IS_MAC` are compared against.
 *
 * Windows is tested first because its agent string contains no `Mac` token,
 * while nothing else contains `Windows`; anything unrecognised reads as Linux,
 * which is what v1's two comparisons treated every non-darwin, non-win32 value
 * as anyway.
 */
export function detectPlatform(): NodeJS.Platform {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Windows/i.test(agent)) return 'win32';
  if (/Mac OS X|Macintosh/i.test(agent)) return 'darwin';
  return 'linux';
}

/** The global the E2E harness sets; see {@link isE2eHarness}. */
const E2E_GLOBAL = '__SHIRANAMI_E2E__';

/**
 * Whether this session is under the E2E harness — v1's `SHIRANAMI_E2E=1`.
 *
 * v1 read the environment variable in the main process and passed the boolean
 * through the contextBridge. A command cannot stand in for that: the renderer
 * reads `__e2e` synchronously at bootstrap and branches on it before the first
 * await. So the backend states it by writing this global, which Tauri's
 * `initialization_script` runs before page scripts — the same guarantee
 * `__TAURI_INTERNALS__` has.
 *
 * Nothing writes it yet; §2.8 step 7 and the new harness are Phase 16's. Until
 * then this is `false`, which is what a non-E2E session should report and what
 * v1 reported for every real user.
 */
export function isE2eHarness(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as Window & { [E2E_GLOBAL]?: boolean })[E2E_GLOBAL] === true;
}
