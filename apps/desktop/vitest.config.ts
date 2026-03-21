import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'desktop',
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**'],
    },
  },
  resolve: {
    alias: {
      '@shiranami/database': resolve(root, '../../packages/database/src/index.ts'),
      '@shiranami/shared': resolve(root, '../../packages/shared/src/index.ts'),
    },
  },
});
