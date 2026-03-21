import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(root, './src'),
      '@shiranami/shared': resolve(root, '../../packages/shared/src/index.ts'),
    },
  },
});
