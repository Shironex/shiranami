import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'database',
    environment: 'node',
    globals: true,
    setupFiles: [resolve(root, './test/setup-sqljs.ts')],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      'better-sqlite3': resolve(root, './test/better-sqlite3-mock.ts'),
      '@shiranami/database': resolve(root, './src/index.ts'),
    },
  },
});
