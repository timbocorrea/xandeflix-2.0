import os from 'node:os';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const viteCacheDir = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'xandeflix2-vite-cache',
);

export default defineConfig({
  cacheDir: viteCacheDir,
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
