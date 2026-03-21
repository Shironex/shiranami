import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'packages/database/package.json'));
const pkgJson = require.resolve('better-sqlite3/package.json');
const dir = dirname(pkgJson);

execSync('npm rebuild', {
  cwd: dir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
