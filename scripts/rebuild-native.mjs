import { execFileSync } from 'node:child_process';

// Delegates to `electron-builder install-app-deps` via the desktop package's
// rebuild script — incremental (~1s) instead of a full node-gyp clean+build (~14s).
execFileSync('pnpm', ['--filter', '@shiranami/desktop', 'rebuild'], {
  stdio: 'inherit',
});
