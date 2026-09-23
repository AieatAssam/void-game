import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900, rollupOptions: { input: { main: 'index.html', gallery: 'gallery.html' } } },
});
