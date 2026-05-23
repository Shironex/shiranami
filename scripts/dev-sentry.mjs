#!/usr/bin/env node

/**
 * Run the dev stack with Sentry enabled in the unpackaged build.
 *
 * Wraps `pnpm dev` and provides the env it needs to send events locally:
 *   - SENTRY_FORCE_ENABLE=true        (main process — overrides app.isPackaged)
 *   - VITE_SENTRY_FORCE_ENABLE=true   (renderer — overrides import.meta.env.PROD)
 *   - SENTRY_DSN                      (read from the shell env or root .env)
 *
 * These only override the packaged/PROD gate — consent is still required, so you
 * must toggle crash reporting ON in Settings → Privacy. Nothing here affects
 * packaged/production builds.
 *
 * Usage:
 *   pnpm dev:sentry                 # DSN comes from .env or the shell env
 *   pnpm dev:sentry --dsn=<dsn>     # or pass it inline
 *
 * See .env.example for the variables.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load root .env (gitignored) if present so the DSN can live there. esbuild
// doesn't auto-load .env, which is the whole reason this wrapper exists.
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Allow `--dsn=<value>` to override whatever is in the env.
const args = process.argv.slice(2);
const dsnArg = args.find(a => a.startsWith('--dsn='));
const passthrough = args.filter(a => !a.startsWith('--dsn='));
const dsn = (dsnArg ? dsnArg.slice('--dsn='.length) : process.env.SENTRY_DSN || '').trim();

if (!dsn) {
  console.error(
    [
      '✗ No SENTRY_DSN found.',
      '',
      '  Set it in a root .env file (copy .env.example), export it in your shell,',
      '  or pass it inline:',
      '',
      '    pnpm dev:sentry --dsn=https://<key>@<org>.ingest.sentry.io/<project>',
      '',
      '  Grab the DSN from your Sentry project (Settings → Client Keys).',
    ].join('\n')
  );
  process.exit(1);
}

const childEnv = {
  ...process.env,
  SENTRY_DSN: dsn,
  SENTRY_FORCE_ENABLE: 'true',
  VITE_SENTRY_FORCE_ENABLE: 'true',
};

console.log(
  [
    '▸ Starting dev with Sentry forced on (unpackaged build)',
    '  SENTRY_DSN              provided ✓',
    '  SENTRY_FORCE_ENABLE     true   (main)',
    '  VITE_SENTRY_FORCE_ENABLE true  (renderer)',
    '',
    '  Reminder: toggle crash reporting ON in Settings → Privacy, then use the',
    '  "Send test event" button to verify.',
    '',
  ].join('\n')
);

const child = spawn('pnpm', ['dev', ...passthrough], {
  cwd: root,
  env: childEnv,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', code => process.exit(code ?? 0));
child.on('error', err => {
  console.error('✗ Failed to start dev:', err.message);
  process.exit(1);
});
