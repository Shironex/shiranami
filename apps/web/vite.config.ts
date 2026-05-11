import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shiranami/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@shiranami/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 15175,
    strictPort: true,
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return;
          if (/\/(react|react-dom|zustand|use-sync-external-store)\//.test(id))
            return 'vendor-react';
          if (id.includes('/@radix-ui/')) return 'vendor-radix';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
        },
      },
    },
  },
});
