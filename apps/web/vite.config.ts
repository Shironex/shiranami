import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync } from 'node:fs';
import { resolve } from 'path';

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version;

// Source-map upload runs from CI only, never from a local `pnpm build`. The
// auth token lives exclusively as a GitHub Actions secret; its presence (plus
// CI=true) is the gate. When absent, the plugin is omitted entirely.
const shouldUploadSourcemaps = Boolean(process.env.CI && process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    ...(shouldUploadSourcemaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            // lunofi org is on Sentry's EU region; the plugin defaults to the US
            // instance otherwise and 404s. Overridable via SENTRY_URL.
            url: process.env.SENTRY_URL ?? 'https://de.sentry.io/',
            release: { name: `shiranami@${version}` },
            sourcemaps: {
              // Strip maps from the shipped renderer bundle after upload.
              filesToDeleteAfterUpload: ['dist/**/*.map'],
            },
          }),
        ]
      : []),
  ],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shiranami/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@shiranami/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 15175,
    strictPort: true,
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Group each lazily-loaded locale's namespaces into one chunk so a
          // language switch pulls a single request instead of ~33. English is
          // excluded — it's statically bundled into the i18n entry chunk and
          // must not be split back out into an eager locale chunk.
          const localeMatch = /\/src\/locales\/([^/]+)\//.exec(id);
          if (localeMatch && localeMatch[1] !== 'en') return `locale-${localeMatch[1]}`;

          if (!id.includes('node_modules/')) return;
          if (/\/(react|react-dom|zustand|use-sync-external-store)\//.test(id))
            return 'vendor-react';
          if (id.includes('/@radix-ui/')) return 'vendor-radix';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
        },
      },
    },
  },
});
