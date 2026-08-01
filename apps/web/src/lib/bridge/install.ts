/**
 * The install seam. Imported for its side effect, first, by `main.tsx`.
 *
 * # Why it has to be an import rather than a statement
 *
 * `@/lib/platform` decides `IS_ELECTRON`, `IS_E2E`, `IS_WINDOWS` and `IS_MAC` at
 * module scope and freezes them; 80 modules and 325 call sites read those
 * constants. `main.tsx`'s own import graph reaches `platform.ts` through
 * `queryClient` → `sentry` → `i18n`, and ESM evaluates a module's imports before
 * its body — so any statement at the top of `main.tsx` runs *after*
 * `IS_ELECTRON` has already been decided as `false`. Only an import placed above
 * the others evaluates in time.
 *
 * Nothing in this module's own graph may reach `@/lib/platform`, or the same
 * inversion happens one level down.
 *
 * # Why it does nothing outside Tauri
 *
 * `apps/web` already has three environments where `window.electronAPI` is absent
 * or mocked, and each one is load-bearing:
 *
 * - **Browser dev** (`:15175`): absent, `IS_ELECTRON === false`, and every query
 *   hook returns its empty value through an `IS_ELECTRON` guard. That is the
 *   mock-mode target.
 * - **Storybook**: a recursive Proxy installed by `preview.tsx` *after*
 *   `platform.ts` has evaluated, so `IS_ELECTRON` is `false` while the global is
 *   live — a hybrid eight stories assert against by name.
 * - **vitest**: a literal mock installed by `src/test/setup.ts` before i18n is
 *   imported, so `IS_ELECTRON` is `true`.
 *
 * Installing unconditionally would flip Storybook's `IS_ELECTRON` to `true` and
 * fail those stories, and would replace vitest's mock with a bridge whose
 * commands cannot answer. So the shim is inert unless the Tauri webview is
 * actually there: nightcore's `tauriInvoke(fallback)` shape — resolving to mock
 * data outside the webview — is deliberately *not* adopted, because this app's
 * fallback is not mock data, it is the guarded empty path it already has.
 */

import { createElectronApi } from './index';
import { isTauri } from './environment';

/**
 * Install `window.electronAPI` when running inside Tauri; otherwise do nothing.
 *
 * Returns whether it installed, which is what the tests assert on — a `void`
 * side effect would leave "was it inert?" unobservable.
 */
export function installElectronApiBridge(): boolean {
  if (!isTauri()) return false;

  // An own, non-configurable property, the way `contextBridge` exposed one: the
  // renderer treats this global as a given, and a later assignment replacing it
  // would silently swap the transport under 205 call sites.
  Object.defineProperty(window, 'electronAPI', {
    value: createElectronApi(),
    writable: false,
    configurable: false,
    enumerable: true,
  });

  return true;
}

installElectronApiBridge();
