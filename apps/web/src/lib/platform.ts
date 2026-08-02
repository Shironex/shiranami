// The bridge must be installed before the constants below are computed, and
// this import is what makes that true *structurally* rather than by convention.
//
// `main.tsx` puts `import '@/lib/bridge/install'` first for the same reason, and
// in the dev server that is enough — Vite serves each module separately and
// evaluates them in import order. A Rollup production build does not preserve
// that: it hoists `platform.ts` into a shared chunk, and ESM evaluates an
// imported chunk *completely* before the body of the chunk that imports it. So
// `platform.ts` ran, froze `IS_ELECTRON = false`, and only then did the entry
// chunk reach the install seam. Every one of the 325 call sites downstream then
// read a constant that said "not Electron" inside the Tauri webview — the app
// booted into permanent mock mode and showed the first-run wizard on every
// launch. Found by the Phase 18 E2E suite; invisible to `pnpm tauri:dev`.
//
// Declaring the dependency here is the fix, because it is the real one: these
// constants are derived from what the seam installs. `install.ts` is inert
// outside the Tauri webview and nothing in its graph reaches this module (both
// files document that invariant), so this cannot cycle and costs the browser,
// Storybook and vitest environments nothing.
import '@/lib/bridge/install';

/** Whether we're running inside Electron (vs plain browser) */
export const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI;

/**
 * True only under the Playwright e2e harness (main process launched with
 * SHIRANAMI_E2E=1, surfaced via the preload bridge). Used to skip first-run-only
 * UI like the onboarding wizard so specs land directly on the app shell.
 */
export const IS_E2E = IS_ELECTRON && window.electronAPI?.__e2e === true;

const platform = IS_ELECTRON ? window.electronAPI?.platform : undefined;

/** Whether the app is running on Windows inside Electron */
export const IS_WINDOWS = IS_ELECTRON && platform === 'win32';

/** Whether the app is running on macOS */
export const IS_MAC =
  platform === 'darwin' ||
  (!IS_ELECTRON &&
    typeof navigator !== 'undefined' &&
    ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform === 'macOS' ||
      /Mac|iPhone|iPad/.test(navigator.platform)));
