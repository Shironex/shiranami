import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

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
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: [
      'src/main/index.ts',
      'src/main/extract-worker.ts',
      'src/main/scan-utility.ts',
      'src/main/scan-utility-spike.ts',
    ],
    external: mainExternal,
  }),
  build({
    ...sharedOptions,
    entryPoints: ['src/main/preload.ts'],
    external: preloadExternal,
  }),
]);
