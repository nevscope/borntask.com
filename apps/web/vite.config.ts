import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@borntask/shared': fileURLToPath(new URL('../../packages/shared/dist/index.js', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3010',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
