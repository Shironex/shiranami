import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Externalize all npm dependencies — they're bundled by electron-builder at
// package time via node_modules.  Workspace packages are kept bundled (tiny)
// to avoid workspace-protocol resolution issues in production builds.
const external = [
  'electron',
  ...Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@shiranami/')),
];

await build({
  entryPoints: ['src/main/index.ts', 'src/main/preload.ts', 'src/main/extract-worker.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  sourcemap: true,
  external,
  logLevel: 'info',
});
