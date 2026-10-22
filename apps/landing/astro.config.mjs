// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SHIRANAMI_SITE_URL || 'https://shiranami.app',
  // Astro 7 changed the default to 'jsx', which collapses whitespace between
  // adjacent inline elements. Pinned to the pre-v7 behaviour until each call
  // site is reviewed; see docs/migrate/2026-07-26-astro-6-to-7-landing.md.
  compressHTML: true,
  integrations: [
    react(),
    // /room is a noindex preview of the redesigned hero; keep it out of search.
    sitemap({ filter: page => !new URL(page).pathname.startsWith('/room') }),
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
