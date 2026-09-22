import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/web/vitest.config.ts',
      'packages/shared/vitest.config.ts',
      'packages/contracts/vitest.config.ts',
      'packages/eslint-plugin/vitest.config.ts',
      'apps/server/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'apps/web/src/**/*.{ts,tsx}',
        'packages/shared/src/**/*.ts',
        'packages/contracts/src/**/*.ts',
        'packages/eslint-plugin/src/**/*.ts',
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
        'scripts/**',
      ],
    },
  },
});
