import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Source-map upload runs from CI only, never from a local `pnpm build`. The
// auth token lives exclusively as a GitHub Actions secret; its presence (plus
// CI=true) is the gate. When absent, no plugin is added and no maps leave the
// machine.
const shouldUploadSourcemaps = Boolean(process.env.CI && process.env.SENTRY_AUTH_TOKEN);

const sentryPlugins = shouldUploadSourcemaps
  ? [
      sentryEsbuildPlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // The lunofi org lives on Sentry's EU region; the plugin otherwise
        // defaults uploads to the US instance (sentry.io) and 404s. Overridable
        // via SENTRY_URL for forks on a different region.
        url: process.env.SENTRY_URL ?? 'https://de.sentry.io/',
        release: { name: `shiranami@${pkg.version}` },
        sourcemaps: {
          // Strip maps from the shipped artifact after upload so they aren't
          // distributed to users.
          filesToDeleteAfterUpload: ['dist/main/**/*.map'],
        },
      }),
    ]
  : [];

// Main + worker: externalize all npm dependencies. They're shipped via
// node_modules and electron-builder rebuilds native modules (better-sqlite3,
// node-addon-api, flac-tagger) against the Electron ABI at package time.
// Bundling them would defeat the rebuild step.
const mainExternal = [
  'electron',
  ...Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@shiranami/')),
];

// Preload: runs in Electron's sandboxed renderer context. require() from the
// sandbox cannot resolve npm modules from app.asar/node_modules the way the
// main process can, so anything the preload depends on (e.g. zod via the
// @shiranami/contracts schemas) must be bundled into preload.js. Only
// `electron` itself is external — the sandbox provides it as a built-in.
const preloadExternal = ['electron'];

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  sourcemap: true,
  logLevel: 'info',
  // Inject build-time constants. Each is replaced at compile time so the value
  // is baked into the shipped bundle (the packaged main process has no access
  // to these env vars at runtime on a user's machine).
  //   - Sentry DSN (public-ish): empty string → main-process Sentry init is
  //     skipped entirely.
  //   - Last.fm app key + shared secret: a per-application credential (not a
  //     user secret). Last.fm's desktop-auth model expects it to ship inside
  //     the client; empty string → the UI shows Last.fm as unavailable while
  //     ListenBrainz (user-token only) keeps working. Inlining the
  //     `process.env.*` read makes the value available in packaged builds; in
  //     dev, run `SHIRANAMI_LASTFM_API_KEY=... SHIRANAMI_LASTFM_SECRET=... pnpm dev`.
  define: {
    __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? ''),
    'process.env.SHIRANAMI_LASTFM_API_KEY': JSON.stringify(
      process.env.SHIRANAMI_LASTFM_API_KEY ?? ''
    ),
    'process.env.SHIRANAMI_LASTFM_SECRET': JSON.stringify(
      process.env.SHIRANAMI_LASTFM_SECRET ?? ''
    ),
  },
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: [
      'src/main/index.ts',
      'src/main/extract-worker.ts',
      'src/main/scan-utility.ts',
      'src/main/waveform-worker.ts',
    ],
    external: mainExternal,
    plugins: sentryPlugins,
  }),
  build({
    ...sharedOptions,
    entryPoints: ['src/main/preload.ts'],
    external: preloadExternal,
  }),
]);
