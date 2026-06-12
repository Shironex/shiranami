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
  // Drop SDK debug logging from the production renderer bundle. Documented
  // Sentry tree-shake flag; no effect on behaviour, just removes dev-only
  // logger code paths.
  define: {
    __SENTRY_DEBUG__: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shiranami/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@shiranami/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      // @sentry/browser's barrel statically re-exports Session Replay (rrweb +
      // the replay-canvas recorder + a compression web worker) and the User
      // Feedback widget (~420 KB raw combined), which a namespace re-export
      // keeps un-shakeable. This app enables neither, so alias those packages to
      // an inert stub that satisfies every binding @sentry/browser pulls from
      // them. See src/lib/sentry-replay-stub.ts.
      '@sentry-internal/replay': resolve(__dirname, './src/lib/sentry-replay-stub.ts'),
      '@sentry-internal/replay-canvas': resolve(__dirname, './src/lib/sentry-replay-stub.ts'),
      '@sentry-internal/feedback': resolve(__dirname, './src/lib/sentry-replay-stub.ts'),
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
          // Anchor on the package's own node_modules segment so scoped packages
          // that merely end in `react` (e.g. @sentry/react) are NOT swept into
          // the eager vendor-react chunk — that would undo their lazy-loading.
          if (/\/node_modules\/(react|react-dom|zustand|use-sync-external-store)\//.test(id))
            return 'vendor-react';
          if (id.includes('/@radix-ui/')) return 'vendor-radix';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
        },
      },
    },
  },
});
