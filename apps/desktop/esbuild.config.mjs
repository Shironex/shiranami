import { build } from 'esbuild';

await build({
  entryPoints: ['src/main/index.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  sourcemap: true,
  external: [
    'electron',
    'better-sqlite3',
    'electron-store',
    'electron-updater',
    'music-metadata',
  ],
  logLevel: 'info',
});
