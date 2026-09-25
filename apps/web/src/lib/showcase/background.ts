/**
 * An optional custom wallpaper for showcase mode, as if the user had imported
 * one in Settings > Appearance.
 *
 * It is opt-in twice over: the page must be opened with `&background=1`, and
 * the files must exist in `apps/web/showcase-local/background/` (gitignored).
 * `showcase.config.mjs` writes them there from `SHOWCASE_BACKGROUND`, so the
 * image itself never enters the repository. Without either, showcase mode keeps
 * the default theme.
 *
 * The saved-background library is read through a Tauri command rather than
 * `window.electronAPI`, so this answers that one command and points the media
 * URLs at the dev server, where the files are.
 */

import {
  commands as generated,
  type BackgroundLibrary,
  type CustomBackground,
} from '@shiranami/contracts/bindings';
import { setShowcaseStreamBase } from '@/lib/bridge/stream-urls';

/** `&background=1` asks for the wallpaper. */
export const SHOWCASE_BACKGROUND_PARAM = 'background';

/** Where the dev server serves the files from, relative to `apps/web`. */
const BASE_PATH = '/showcase-local';

export function isShowcaseBackgroundRequested(): boolean {
  return new URLSearchParams(window.location.search).get(SHOWCASE_BACKGROUND_PARAM) === '1';
}

async function readLibrary(): Promise<BackgroundLibrary> {
  const response = await fetch(`${BASE_PATH}/background/background.json`);
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('json')) return { entries: [], activeId: null };
  const background = (await response.json()) as CustomBackground;
  return {
    entries: [{ id: 'showcase', label: 'Showcase', background }],
    activeId: 'showcase',
    nextId: 2,
  };
}

/**
 * Answer the library command from the local files. The generated binding is
 * replaced rather than the wrapped `commands` surface, because the wrappers in
 * `@/lib/bridge/commands` cache each method on first read; they still wrap this
 * one, so the answer goes through the same rehydration and URL rewrite.
 */
export function installShowcaseBackground(): void {
  setShowcaseStreamBase(`${window.location.origin}${BASE_PATH}`);
  generated.backgroundLibraryGet = readLibrary;
}
