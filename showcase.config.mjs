// README and portfolio images, captured from the web build in showcase mode:
// `?showcase=1` serves a fixed, invented demo library with no backend (see
// apps/web/src/lib/showcase). Works the same on macOS and Windows.
//
//   pnpm showcase all          capture every view in en and pl, frame them,
//                              export the portfolio images
//   pnpm showcase hero         render assets/showcase/hero.webp
//   pnpm showcase readme --lang pl --cols 2   print the README table
//
// The portfolio export goes next to this repo unless SHOWCASE_PORTFOLIO_DIR
// points somewhere else.
//
// SHOWCASE_BACKGROUND=<image or GIF> shows that file as the custom wallpaper
// (Settings > Appearance > Your image). It is copied to apps/web/showcase-local
// (gitignored), never into the repository; without it the default theme shows.
// An animated GIF is staged as its first frame: a screenshot cannot show
// motion, and the Settings tile would otherwise show whichever frame is current.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@noctcore/showcase-kit';
import sharp from 'sharp';

const ORIGIN = 'http://localhost:15175';

/** Stage the wallpaper where showcase mode serves it; true when there is one. */
async function prepareBackground(source) {
  const dir = fileURLToPath(new URL('./apps/web/showcase-local/background/', import.meta.url));
  await rm(dir, { recursive: true, force: true });
  if (!source) return false;

  await mkdir(dir, { recursive: true });
  const fileName = 'bg-showcase.webp';
  const { width, height } = await sharp(source, { page: 0 })
    .webp({ quality: 92 })
    .toFile(join(dir, fileName));
  const record = { fileName, stillFileName: null, width, height, animated: false };
  await writeFile(join(dir, 'background.json'), JSON.stringify(record));
  return true;
}

const withBackground = await prepareBackground(process.env.SHOWCASE_BACKGROUND);

const READY = '[data-testid="app-ready"]';

/**
 * Open a sidebar view from a fresh load, then park the pointer where it hovers
 * nothing. The reload keeps shots independent: no half-finished transition or
 * leftover input from the previous view (the URL keeps the language).
 */
function view(id, then) {
  return async page => {
    await page.reload();
    await page.locator(READY).waitFor({ state: 'attached' });
    // Load every declared font face now. `document.fonts.ready` only covers
    // faces already requested, and one requested later can move text by a
    // pixel between runs.
    await page.evaluate(() =>
      Promise.all([...document.fonts].map(face => face.load().catch(() => {})))
    );
    await page.locator(`[data-view="${id}"]`).first().click();
    if (then) await then(page);
    await page.mouse.move(1439, 450);
  };
}

/**
 * Type into the view's input and submit it, as a person would. An Enter that
 * lands before React has committed the typed value submits the old one, so
 * press it again until the result shows.
 */
function submit(text, resultText) {
  return async page => {
    const input = page.locator('#main-content input').first();
    const result = page.getByText(resultText, { exact: true }).first();
    await input.fill(text);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await input.press('Enter');
      try {
        await result.waitFor({ timeout: 3000 });
        break;
      } catch {
        // Not there yet: submit again.
      }
    }
    await result.waitFor();
    // Search suggestions arrive on a debounce and can open after the results;
    // let them land, then close them the way a person would.
    await page.waitForTimeout(800);
    await input.press('Escape');
    await input.blur();
  };
}

export default defineConfig({
  name: 'Shiranami',
  slug: 'shiranami',
  target: {
    mode: 'url',
    url: `${ORIGIN}/?showcase=1`,
    start: 'pnpm dev:web',
    readyTimeoutMs: 120000,
  },
  ready: READY,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  langs: ['en', 'pl'],
  // Track-row durations are 11px text centred in a 48px row, which puts them
  // on a half device pixel at 2x, where Chromium may raster them one pixel up
  // or down from run to run. A whole-pixel line height keeps captures
  // identical; the difference is invisible.
  css: '#main-content .tabular-nums { line-height: 16px; }',
  // Showcase mode reads its language from the URL and keeps its own in-memory
  // profile, so each language is one fresh load.
  setup: async ({ page, lang }) => {
    await page.goto(`${ORIGIN}/?showcase=1&lang=${lang}${withBackground ? '&background=1' : ''}`);
  },
  shots: [
    {
      id: 'overview',
      title: 'Overview',
      caption: 'Overview: your evening at a glance, with the weekly recap and a year-ago memory.',
      nav: view('overview'),
      delayMs: 800,
    },
    {
      id: 'library',
      title: 'Library',
      caption: 'Library: browse and play straight from your own folders.',
      nav: view('library'),
      delayMs: 600,
    },
    {
      id: 'playlists',
      title: 'Playlists',
      caption: 'Playlists: custom covers and quick access from the sidebar.',
      nav: view('playlists'),
      delayMs: 600,
    },
    {
      id: 'favorites',
      title: 'Favorites',
      caption: 'Favorites: every track you have hearted, in one place.',
      nav: view('favorites'),
      delayMs: 600,
    },
    {
      id: 'history',
      title: 'History',
      caption: 'History: play counts, listening time and daily activity.',
      nav: view('history'),
      delayMs: 1200,
    },
    {
      id: 'mixes',
      title: 'Mixes',
      caption: 'Mixes: smart collections built from your listening and the time of day.',
      nav: view('mixes'),
      delayMs: 1000,
    },
    {
      id: 'search',
      title: 'Search',
      caption: 'Search: find tracks on YouTube and download them with yt-dlp and ffmpeg.',
      nav: view('search', submit('paper moons', 'Paper Moons (full album)')),
      delayMs: 800,
    },
    {
      id: 'import-playlist',
      title: 'Import Playlist',
      caption: 'Import: bring a whole YouTube or Spotify playlist in, with match confidence.',
      nav: view(
        'import-playlist',
        submit(
          'https://www.youtube.com/playlist?list=PLshowcase',
          'Lantern Theory - Kettle at Midnight'
        )
      ),
      delayMs: 800,
    },
    {
      id: 'radio',
      title: 'Radio',
      caption: 'Radio: browse and stream internet stations from around the world.',
      nav: view('radio'),
      delayMs: 1000,
    },
    {
      id: 'smart-playlists',
      title: 'Smart Playlists',
      caption: 'Smart playlists: rules that keep a playlist up to date on their own.',
      nav: view('smart-playlists', async page => {
        await page.getByText('Heavy Rotation', { exact: true }).first().click();
      }),
      delayMs: 800,
    },
    {
      id: 'downloads',
      title: 'Downloads',
      caption: 'Downloads: a queue with progress, retries and automatic import.',
      nav: view('downloads'),
      delayMs: 600,
    },
    {
      id: 'settings',
      title: 'Settings',
      caption: 'Settings: themes, accent colors, audio, integrations and language.',
      nav: view('settings', async page => {
        await page.locator('[data-section="appearance"]').click();
        // Centre the theme picker, where the wallpaper choice lives.
        await page
          .locator('#main-content img[src*="themes/"]')
          .first()
          .evaluate(tile => tile.scrollIntoView({ block: 'center' }));
      }),
      delayMs: 800,
    },
  ],
  frame: {
    style: 'window',
    theme: 'dark',
    background: { type: 'gradient', from: '#4c1d95', to: '#110e1a', angle: 135 },
    padding: 72,
    radius: 14,
    shadow: true,
    maxWidth: 1800,
  },
  outputs: {
    raw: 'showcase-out/raw/{lang}/{id}.png',
    readme: 'assets/showcase/{lang}/{id}.webp',
    portfolio: {
      dir: process.env.SHOWCASE_PORTFOLIO_DIR ?? '../portfolio/public/projects/{slug}',
      size: [1920, 1080],
      thumbnail: 'overview',
    },
  },
  hero: {
    tagline: 'A calm desktop player for your local music.',
    logo: 'assets/brand/shiranami-icon-1024.png',
    shots: ['playlists', 'history', 'overview'],
    output: 'assets/showcase/hero.webp',
  },
});
