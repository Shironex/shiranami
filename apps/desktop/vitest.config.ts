import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'desktop',
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup-sqljs.ts', './test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**'],
    },
  },
  resolve: {
    alias: {
      'better-sqlite3': resolve(root, 'test/better-sqlite3-mock.ts'),
      '@shiranami/database/client': resolve(root, '../../packages/database/src/client.ts'),
      '@shiranami/database': resolve(root, '../../packages/database/src/index.ts'),
      '@shiranami/shared': resolve(root, '../../packages/shared/src/index.ts'),
      '@shiranami/contracts': resolve(root, '../../packages/contracts/src/index.ts'),
    },
  },
});
