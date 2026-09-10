/**
 * Library search, driven through the actual input.
 *
 * The only spec in this capability that asserts on rendered DOM rather than on
 * a store, and it has to be: the filtered array is `useState` local to
 * `LibraryView.hooks.ts`, deliberately not registered in `e2e-bridge.ts`. There
 * is no handle to read — the rendered rows *are* the result.
 *
 * # Virtualisation is why the fixture is four tracks and not four hundred
 *
 * `LibraryView` renders through `react-window`, so the DOM holds roughly one
 * viewport of rows plus ten of overscan and nothing else. An assertion on "all
 * matching rows" would be measuring the window height. Four rows fit in any
 * window this suite opens, so presence and absence both mean what they say.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell, seedLibraryThroughApp } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { writeTracks } from '../helpers/audio.js';

const MEDIA = profile('library').mediaDir;

const FIXTURE = [
  { title: 'Harbour Lights', artist: 'Aoi', album: 'Migrated Nights' },
  { title: 'Paper Lanterns', artist: 'Aoi', album: 'Migrated Nights' },
  { title: 'Slow Ferry', artist: 'Nagi', album: 'Harbour Tapes' },
  { title: 'Midnight Tram', artist: 'Kumo', album: 'Late Lines' },
];

/** The search box; the app's one and only `data-testid`. */
const SEARCH = '[data-testid="library-search-input"]';

/**
 * Titles currently in the DOM.
 *
 * `react-window` stamps `data-react-window-index` on every row it renders, and
 * the first `<p>` inside a row's button is the title — `TrackRowContent` gives
 * it no id of its own, so position within the row is the only handle there is.
 */
async function renderedTitles(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('div[data-react-window-index]'))
      .map(row => row.querySelector('button p')?.textContent?.trim() ?? '')
      .filter(title => title.length > 0)
  );
}

async function typeSearch(term: string): Promise<void> {
  const input = await browser.$(SEARCH);
  await input.waitForDisplayed({ timeout: 15_000 });
  await input.click();
  // `setValue` clears first, which is what every case here wants.
  await input.setValue(term);
}

async function clearSearch(): Promise<void> {
  const input = await browser.$(SEARCH);
  await input.clearValue();
  // React controlled inputs do not always see `clearValue` as an input event;
  // typing and removing one character guarantees one fires.
  await input.setValue(' ');
  await browser.keys(['Backspace']);
}

describe('search', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();

    // Both preferences are persisted, and both have to be in `localStorage`
    // *before* the single reload below — the library view has to mount already
    // in tracks mode and already as the landing view.
    //
    // `landingView` is what makes this spec possible at all. Clicking the
    // sidebar mid-session sets `activeView` but leaves the old view on screen,
    // because `AnimatePresence mode="wait"` waits for an exit animation that an
    // occluded window never finishes (see `navigateTo`'s doc). Landing on the
    // view instead means it mounts with `initial={false}` and no transition.
    await browser.execute(() => {
      const ui = window.__shiranami!.stores.ui.getState() as unknown as {
        setLibraryViewMode: (mode: string) => void;
        setLandingView: (view: string) => void;
      };
      ui.setLibraryViewMode('tracks');
      ui.setLandingView('library');
    });

    const files = writeTracks(MEDIA, FIXTURE.length);
    // One reload, which both seeds through `mapDbTracksToTracks` — the rows have
    // to survive that mapping to render at all — and lands on the library.
    await seedLibraryThroughApp(FIXTURE.map((row, index) => ({ ...row, filePath: files[index] })));

    await browser.waitUntil(async () => (await renderedTitles()).length === FIXTURE.length, {
      timeout: 20_000,
      timeoutMsg: 'the seeded library never rendered',
    });
  });

  beforeEach(async () => {
    await clearSearch();
    await browser.waitUntil(async () => (await renderedTitles()).length === FIXTURE.length, {
      timeout: 10_000,
      timeoutMsg: 'the library did not return to its unfiltered state',
    });
  });

  it('shows every track when the box is empty', async () => {
    expect((await renderedTitles()).sort()).toEqual(FIXTURE.map(row => row.title).sort());
  });

  it('filters by title', async () => {
    await typeSearch('Ferry');

    await browser.waitUntil(async () => (await renderedTitles()).length === 1, {
      timeout: 10_000,
      timeoutMsg: 'the title filter never narrowed to one row',
    });
    expect(await renderedTitles()).toEqual(['Slow Ferry']);
  });

  it('filters by artist', async () => {
    await typeSearch('Aoi');

    await browser.waitUntil(async () => (await renderedTitles()).length === 2, {
      timeout: 10_000,
      timeoutMsg: 'the artist filter never narrowed to two rows',
    });
    expect((await renderedTitles()).sort()).toEqual(['Harbour Lights', 'Paper Lanterns']);
  });

  it('is case insensitive', async () => {
    await typeSearch('mIdNiGhT');

    await browser.waitUntil(async () => (await renderedTitles()).length === 1, {
      timeout: 10_000,
      timeoutMsg: 'a mixed-case term did not match',
    });
    expect(await renderedTitles()).toEqual(['Midnight Tram']);
  });

  it('matches across fields, not only the title', async () => {
    // "Harbour" is a title word for one track and an album word for another, so
    // a search that only looked at titles would return one row instead of two.
    await typeSearch('Harbour');

    await browser.waitUntil(async () => (await renderedTitles()).length === 2, {
      timeout: 10_000,
      timeoutMsg: 'the cross-field search did not return both rows',
    });
    expect((await renderedTitles()).sort()).toEqual(['Harbour Lights', 'Slow Ferry']);
  });

  it('shows no rows and an empty state when nothing matches', async () => {
    await typeSearch('zzzzzz-no-such-track');

    await browser.waitUntil(async () => (await renderedTitles()).length === 0, {
      timeout: 10_000,
      timeoutMsg: 'rows were still rendered for a term that matches nothing',
    });

    // The list container itself goes away — `LibraryView` swaps the virtual list
    // for the compact empty state rather than rendering an empty list.
    expect(await (await browser.$('div[role="list"]')).isExisting()).toBe(false);
  });

  it('restores the full list when the term is cleared', async () => {
    await typeSearch('Ferry');
    await browser.waitUntil(async () => (await renderedTitles()).length === 1, {
      timeout: 10_000,
      timeoutMsg: 'the filter never applied',
    });

    await clearSearch();

    await browser.waitUntil(async () => (await renderedTitles()).length === FIXTURE.length, {
      timeout: 10_000,
      timeoutMsg: 'clearing the search did not restore every row',
    });
  });
});
