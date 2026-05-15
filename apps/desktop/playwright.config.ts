import { defineConfig } from '@playwright/test';

const isCi = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Electron uses a single-instance lock keyed off userData; each worker owns
  // its own userDataDir, but boots are still sequential to keep CI logs sane.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']]
    : 'list',
  // App boot includes esbuild renderer load + protocol registration; first
  // window can take a few seconds on slower runners.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: isCi ? 'on-first-retry' : 'retain-on-failure',
    video: isCi ? 'on-first-retry' : 'retain-on-failure',
  },
});
