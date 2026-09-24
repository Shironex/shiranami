/**
 * Showcase mode's install seam, called from `@/lib/bridge/install` when the page
 * is not in the Tauri webview.
 *
 * Like the bridge it sits beside, nothing in this module's static graph may
 * reach `@/lib/platform`: it runs so that `IS_ELECTRON` sees the surface it
 * installs. The fixtures are only ever reached through the dynamic import below,
 * after the flag check, so a page without `?showcase=1` never fetches them.
 *
 * The caller gates this on `import.meta.env.DEV`, so a production build drops
 * the call and, with it, this module and the fixture chunk.
 */

import {
  isIpcError,
  PLAYLIST_ERROR_CODES,
  SHARE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
import type { ElectronAPI } from '@/types/electron';
import { installShowcaseBackground, isShowcaseBackgroundRequested } from './background';
import { freezeClock, seedRandom } from './determinism';
import { isShowcaseRequested } from './flag';
import { createLazyApi } from './lazyApi';
import { installShowcaseProfile } from './profile';

/** What the fixture module has to provide. */
export interface ShowcaseFixtureModule {
  /** The fixture surface, shaped like `window.electronAPI`. */
  api: Record<string, unknown>;
  /** Answers a cross-origin request, or rejects it: showcase mode stays offline. */
  respond: (url: URL, init?: RequestInit) => Promise<Response>;
}

export type ShowcaseFixtureLoader = () => Promise<ShowcaseFixtureModule>;

const loadFixtures: ShowcaseFixtureLoader = () => import('./fixtures');

/**
 * The platform showcase mode reports, whatever machine it runs on, so captures
 * from macOS and Windows match.
 */
export const SHOWCASE_PLATFORM: NodeJS.Platform = 'darwin';

/**
 * Route every cross-origin `fetch` to the fixtures. Same-origin requests (the
 * dev server's own modules and assets) pass through untouched.
 */
function keepOffline(load: ShowcaseFixtureLoader): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin) return realFetch(input, init);
    return load().then(fixtures => fixtures.respond(url, init));
  };
}

/**
 * Install the fixture-backed `window.electronAPI` when the page asked for it.
 * Returns whether it installed.
 */
export function installShowcaseMode(loader: ShowcaseFixtureLoader = loadFixtures): boolean {
  if (!isShowcaseRequested()) return false;

  freezeClock();
  seedRandom();
  const withBackground = isShowcaseBackgroundRequested();
  installShowcaseProfile(withBackground);
  if (withBackground) installShowcaseBackground();

  let pending: Promise<ShowcaseFixtureModule> | null = null;
  const load = () => (pending ??= loader());

  const api = createLazyApi<ElectronAPI>(() => load().then(fixtures => fixtures.api), {
    platform: SHOWCASE_PLATFORM,
    __e2e: false,
    errors: { isIpcError, SHARE_ERROR_CODES, PLAYLIST_ERROR_CODES, VALIDATION_ERROR_CODES },
  });

  Object.defineProperty(window, 'electronAPI', {
    value: api,
    writable: false,
    configurable: true,
    enumerable: true,
  });

  keepOffline(load);
  document.documentElement.dataset.showcase = 'true';
  return true;
}
