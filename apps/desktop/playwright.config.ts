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
  // If the toolchain breaks systemically (sandbox flag drift, xvfb regression,
  // dist not built, etc.) the first few tests will fail the same way. Bail
  // after 5 to keep the burn-rate honest — at 25 s timeout + 1 retry that
  // caps a broken run at ~4 min instead of letting all 30 specs each burn
  // the full timeout. Once specs stabilise this can move higher.
  maxFailures: isCi ? 5 : undefined,
  reporter: isCi
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']]
    : 'list',
  // Steady-state per-test on Linux is ~4 s including app boot. 25 s leaves
  // ~6× headroom for slow runners; tests aren't doing real network or audio
  // I/O so anything past that is almost certainly a hang, not a slow path.
  timeout: 25_000,
  expect: { timeout: 5_000 },
  use: {
    trace: isCi ? 'on-first-retry' : 'retain-on-failure',
    video: isCi ? 'on-first-retry' : 'retain-on-failure',
  },
});
