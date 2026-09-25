import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

// Dev only: POST a data URL to /__shot?name=x and it lands in .shots/x.jpg (canvas captures for review when the browser
// window is in the background and the page can't be screenshotted).
const shots = {
  name: 'shots',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
        mkdirSync('.shots', { recursive: true });
        writeFileSync(`.shots/${name}.jpg`, Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  base: './',
  plugins: [shots],
  build: { chunkSizeWarningLimit: 1200, rollupOptions: { input: { main: 'index.html', gallery: 'gallery.html' } } },
});
