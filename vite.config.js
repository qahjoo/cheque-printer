// =============================================================================
// vite.config.js — تهيئة Vite لواجهة React داخل Electron
// base './' so the built assets load correctly via file:// in the packaged app.
// root '.' with renderer entry (index.html) at project root.
// =============================================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['renderer/**/*.test.{js,jsx}'],
  },
});
