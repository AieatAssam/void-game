import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200, rollupOptions: { input: { main: 'index.html', gallery: 'gallery.html' } } },
});
