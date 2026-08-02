/**
 * Driving the renderer.
 *
 * Two globals do all the work, and both already exist in v2 for reasons that
 * predate this suite:
 *
 * - `window.electronAPI` — the §2.6 shim. Installed synchronously at module
 *   scope by `bridge/install.ts`, so its presence is the real "renderer is up"
 *   signal. v1's harness learned the same lesson the hard way: a load-state
 *   wait resolves on the pre-navigation blank document.
 * - `window.__shiranami.stores` — the zustand registry, dynamically imported by
 *   `main.tsx` when `electronAPI.__e2e` is true. Because it is *dynamic*, it
 *   arrives a tick or two after the bridge and needs its own wait.
 */

import { browser } from '@wdio/globals';

/** How long a cold boot may take before the spec gives up. */
const BOOT_TIMEOUT = 60_000;

/** Wait for the §2.6 shim. Every spec needs this before it can do anything. */
export async function waitForBridge(): Promise<void> {
  await browser.waitUntil(
    async () => (await browser.execute(() => 'electronAPI' in window)) === true,
    {
      timeout: BOOT_TIMEOUT,
      timeoutMsg: 'window.electronAPI never appeared — the renderer did not finish booting',
    }
  );
}

/** Wait for the e2e store registry. Only present under `SHIRANAMI_E2E=1`. */
export async function waitForStores(): Promise<void> {
  await waitForBridge();
  await browser.waitUntil(
    async () => (await browser.execute(() => window.__shiranami !== undefined)) === true,
    {
      timeout: BOOT_TIMEOUT,
      timeoutMsg:
        'window.__shiranami never appeared — either SHIRANAMI_E2E was not 1, or main.tsx did ' +
        'not reach its dynamic import of e2e-bridge',
    }
  );
}

/**
 * Wait for the app shell, past the splash and the first-run wizard.
 *
 * The sidebar is the marker: `App.tsx` renders it only in the
 * `splashDone && onboardingDone` branch, and `#app-sidebar` is a static id
 * rather than an i18n-dependent label.
 */
export async function waitForShell(): Promise<void> {
  const sidebar = await browser.$('#app-sidebar');
  await sidebar.waitForExist({
    timeout: BOOT_TIMEOUT,
    timeoutMsg: 'the app shell never rendered (still on the splash or the onboarding wizard?)',
  });
}

/**
 * Navigate by clicking the sidebar, the way a user would.
 *
 * # This moves the state but not always the pixels
 *
 * `App.tsx` wraps the active view in `<AnimatePresence mode="wait">`, which
 * unmounts the outgoing view only once its **exit animation** has finished. The
 * app window under this harness is behind the terminal that launched it, and
 * macOS throttles `requestAnimationFrame` for an occluded window — so the exit
 * can simply never complete, and the previous view stays mounted indefinitely
 * while `activeView`, the sidebar's `aria-current` and `main`'s `aria-label` all
 * move on. The symptom is a spec that reads the right view name out of the store
 * and the wrong content out of the DOM.
 *
 * Everything outside `AnimatePresence` is therefore safe to assert on after this
 * call; the view's *contents* are not. A spec that needs rendered rows should
 * use {@link bootIntoView} instead, which lands on the view through a mount
 * rather than a transition.
 */
export async function navigateTo(view: string): Promise<void> {
  const button = await browser.$(`[data-view="${view}"]`);
  await button.waitForClickable({ timeout: 15_000 });
  await button.click();
}

/**
 * Reload so the app *starts* on `view`, mounting it with no transition.
 *
 * `useUIStore` persists a `landingView` preference and applies it to
 * `activeView` on rehydrate, and `AnimatePresence` is declared `initial={false}`
 * — so the first view of a session mounts directly, with no exit animation to
 * wait on. That makes this the only reliable way to get a view's contents into
 * the DOM under the occluded-window conditions described on {@link navigateTo}.
 */
export async function bootIntoView(view: string): Promise<void> {
  await browser.execute(target => {
    (
      window.__shiranami!.stores.ui.getState() as unknown as {
        setLandingView: (v: string) => void;
      }
    ).setLandingView(target);
  }, view);

  await browser.execute(() => {
    window.location.reload();
  });
  await waitForStores();
  await waitForShell();

  await browser.waitUntil(
    async () =>
      (
        await browser.execute(
          () => document.querySelector('main')?.getAttribute('aria-label') ?? ''
        )
      ).length > 0,
    { timeout: 30_000, timeoutMsg: 'the shell never re-rendered after the landing-view reload' }
  );
}

/** Seed library rows through the production IPC, exactly as v1's helper did. */
export async function seedTracks(
  tracks: { title: string; filePath: string; artist?: string; album?: string; duration?: number }[]
): Promise<SeededTrack[]> {
  return browser.execute(async rows => {
    const payload = rows.map(row => ({
      title: row.title,
      filePath: row.filePath,
      artist: row.artist ?? 'Test Artist',
      album: row.album ?? 'Test Album',
      duration: row.duration ?? 1,
      genre: null,
    }));
    return (await window.electronAPI.db.tracks.addMany(payload)) as SeededTrack[];
  }, tracks);
}

/** A row as the db namespace returns it; only the fields specs assert on. */
export interface SeededTrack {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  filePath: string;
  duration: number | null;
  isFavorite: boolean;
}

/**
 * Empty the library, playlists and watched folders.
 *
 * Specs inside one capability share a profile, so each one starts by putting
 * the database back to a known state rather than assuming it. Routed through
 * the IPC rather than the file so it exercises the same cache invalidation the
 * app does — a spec that cleared sqlite behind the app's back would leave the
 * renderer's query cache disagreeing with the database.
 */
export async function resetLibrary(): Promise<void> {
  await browser.execute(async () => {
    const api = window.electronAPI;

    for (const playlist of await api.db.playlists.getAll()) {
      await api.db.playlists.delete(playlist.id);
    }
    const tracks = await api.db.tracks.getAll();
    if (tracks.length > 0) {
      await api.db.tracks.removeMany(tracks.map(track => track.id));
    }
    for (const folder of await api.db.folders.getAll()) {
      await api.db.folders.remove(folder.id);
    }
  });
}

/**
 * Push rows into the library store directly.
 *
 * # This bypasses a mapper, and that matters
 *
 * `db.tracks.*` answers with **database** records; the store holds renderer
 * `Track`s, and `useLibrarySync` converts between them with
 * `mapDbTracksToTracks` before it ever calls `setLibrary`. Handing the raw rows
 * to `setLibrary` skips that conversion, so the store ends up holding objects
 * that satisfy no consumer which reads a mapped field — `LibraryView` throws
 * mid-render and its `ErrorBoundary` swallows the result into a fallback, which
 * looks exactly like "the library is empty".
 *
 * So this is only safe for specs that read the *store* and never assert on
 * rendered rows. Anything that looks at the DOM wants
 * {@link seedLibraryThroughApp} instead.
 */
export async function setLibraryStore(tracks: readonly SeededTrack[]): Promise<void> {
  await browser.execute(rows => {
    window.__shiranami!.stores.library.getState().setLibrary(rows);
  }, tracks as SeededTrack[]);
}

/**
 * Seed the library the way a cold start does, and wait until the UI has it.
 *
 * Writes the rows through the production IPC, then reloads the renderer so
 * `useLibrarySync` re-fetches them and seeds the store through
 * `mapDbTracksToTracks` — the same path a user's second launch takes. Slower
 * than {@link setLibraryStore} by one reload, and the only version whose result
 * the UI can actually render.
 */
export async function seedLibraryThroughApp(
  tracks: { title: string; filePath: string; artist?: string; album?: string; duration?: number }[]
): Promise<SeededTrack[]> {
  await resetLibrary();
  const seeded = await seedTracks(tracks);

  await browser.execute(() => {
    window.location.reload();
  });
  await waitForStores();
  await waitForShell();

  await browser.waitUntil(
    async () =>
      (await browser.execute(
        () => window.__shiranami!.stores.library.getState().library.length
      )) === tracks.length,
    {
      timeout: 30_000,
      timeoutMsg: `the library store never reached ${tracks.length} tracks after a reload`,
    }
  );

  return seeded;
}
