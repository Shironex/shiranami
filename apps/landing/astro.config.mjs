// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';
import { MINCHO_KANJI } from './src/lib/changelog.ts';

export default defineConfig({
  site: process.env.SHIRANAMI_SITE_URL || 'https://shiranami.app',
  // Astro 7 changed the default to 'jsx', which collapses whitespace between
  // adjacent inline elements. Pinned to the pre-v7 behaviour until each call
  // site is reviewed; see docs/migrate/2026-07-26-astro-6-to-7-landing.md.
  compressHTML: true,
  // The whole stylesheet is a few KB compressed: inlined, the first paint no
  // longer waits on a second round trip for it.
  build: { inlineStylesheets: 'always' },
  // The listening room was previewed at /room before it became the homepage.
  redirects: { '/room': '/' },
  integrations: [
    react(),
    // /changelog/pl/ is a fragment the changelog page fetches, not a page.
    sitemap({ filter: page => !page.endsWith('/changelog/pl/') }),
  ],
  // Self-hosted at build time under /_astro/fonts. Only the weights and styles
  // the CSS sets are fetched; anything heavier is synthesized, as it was with
  // the Google stylesheet.
  fonts: [
    {
      name: 'Inter Tight',
      cssVariable: '--font-inter-tight',
      provider: fontProviders.google(),
      weights: [400],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      name: 'Instrument Serif',
      cssVariable: '--font-instrument-serif',
      provider: fontProviders.google(),
      weights: [400],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['Times New Roman', 'serif'],
    },
    {
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains-mono',
      provider: fontProviders.google(),
      weights: [400, 500],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
    {
      // Only the changelog and download watermarks, the release kanji and the
      // changelog drop caps use it, so it is cut down to those glyphs.
      name: 'Shippori Mincho',
      cssVariable: '--font-shippori-mincho',
      provider: fontProviders.google(),
      weights: [700, 800],
      styles: ['normal'],
      fallbacks: ['Noto Serif JP', 'serif'],
      options: {
        experimental: {
          glyphs: [
            MINCHO_KANJI,
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            'ĄĆĘŁŃÓŚŹŻąćęłńóśźż',
          ],
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
