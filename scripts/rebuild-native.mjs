import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRequire = createRequire(resolve(__dirname, '../apps/desktop/package.json'));
const { version } = desktopRequire('electron/package.json');
const betterSqlitePath = realpathSync(dirname(desktopRequire.resolve('better-sqlite3/package.json')));

console.log(`Rebuilding better-sqlite3 for Electron ${version}...`);
execFileSync(
  'npx',
  [
    'node-gyp', 'rebuild',
    '--runtime=electron',
    `--target=${version}`,
    '--dist-url=https://electronjs.org/headers',
  ],
  {
    stdio: 'inherit',
    cwd: betterSqlitePath,
    shell: true,
  },
);
console.log('Rebuild complete.');
