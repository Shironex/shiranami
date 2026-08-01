import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Every story runs as a real-browser test — render smoke + `play` interactions +
// axe a11y — via @storybook/addon-vitest + Playwright Chromium. Kept as a
// STANDALONE config (not a second project on vitest.config.ts) so the root
// `pnpm test` aggregate stays jsdom-only/fast; run this with `pnpm test:storybook`.
export default defineConfig({
  plugins: [storybookTest({ configDir: join(root, '.storybook') })],
  // The storybookTest plugin does NOT merge vite.config.ts's resolve.alias the
  // way `storybook build` does, so the app aliases must be redeclared here or
  // preview.tsx (imports @shiranami/contracts) + Sentry-touching components fail
  // to resolve in browser mode. Mirrors vite.config.ts lines 45-57.
  resolve: {
    alias: {
      '@': resolve(root, './src'),
      // Must precede the bare entry — alias matching is prefix-based.
      '@shiranami/contracts/bindings': resolve(
        root,
        '../../packages/contracts/src/generated/bindings.ts'
      ),
      '@shiranami/contracts': resolve(root, '../../packages/contracts/src/index.ts'),
      '@shiranami/shared': resolve(root, '../../packages/shared/src/index.ts'),
      // Stub @sentry/browser's un-shakeable Session Replay / Feedback re-exports
      // (this app enables neither) so the browser bundle resolves them inertly.
      '@sentry-internal/replay': resolve(root, './src/lib/sentry-replay-stub.ts'),
      '@sentry-internal/replay-canvas': resolve(root, './src/lib/sentry-replay-stub.ts'),
      '@sentry-internal/feedback': resolve(root, './src/lib/sentry-replay-stub.ts'),
    },
  },
  // Browser mode serves modules over HTTP; pnpm's virtual store lives at the
  // monorepo root, so the addon's injected setup file (and other hoisted deps)
  // must be within fs.allow or the browser fails to fetch them.
  server: { fs: { allow: [resolve(root, '../..')] } },
  // Pre-bundle the story-test runtime deps so Vite never discovers them mid-run.
  // The setup file imports @storybook/react-vite (setProjectAnnotations) and the
  // stories import storybook/test; if these are optimized lazily on a cold run,
  // Vite reloads and the in-flight browser suites lose the Vitest runner
  // ("failed to find the runner"). Including them up front keeps cold starts (CI)
  // deterministic.
  optimizeDeps: { include: ['@storybook/react-vite', 'storybook/test'] },
  test: {
    name: 'storybook',
    // Apply the preview's project annotations — crucially its global `beforeEach`
    // theme/background reset, which addon-vitest does NOT reliably run on its own
    // in the browser run (intermittent cross-story theme bleed → axe contrast
    // flakes without this). See .storybook/vitest.setup.ts.
    setupFiles: ['./.storybook/vitest.setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
