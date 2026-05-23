import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/web/vitest.config.ts',
      'apps/desktop/vitest.config.ts',
      'packages/shared/vitest.config.ts',
      'packages/database/vitest.config.ts',
      'packages/contracts/vitest.config.ts',
      'packages/recommendation/vitest.config.ts',
      'apps/server/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'apps/web/src/**/*.{ts,tsx}',
        'apps/desktop/src/main/**/*.{ts,tsx}',
        'packages/shared/src/**/*.ts',
        'packages/database/src/**/*.ts',
        'packages/contracts/src/**/*.ts',
        'packages/recommendation/src/**/*.ts',
        'apps/server/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/dist/**',
        '**/coverage/**',
        '**/node_modules/**',
        'apps/landing/**',
        'apps/web/src/test/**',
        'apps/desktop/test/**',
        'apps/desktop/e2e/**',
        'packages/database/test/**',
        'packages/database/src/test/**',
        'scripts/**',
        'apps/desktop/esbuild.config.mjs',
        'apps/desktop/scripts/**',
      ],
    },
  },
});
