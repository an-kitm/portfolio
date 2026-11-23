// @ts-check
import { defineConfig } from 'astro/config';

// Locally the site is served from the root (http://localhost:4321/). The GitHub Pages build sets
// SITE_BASE=/portfolio so it is served from https://an-kitm.github.io/portfolio/.
export default defineConfig({
  site: 'https://an-kitm.github.io',
  base: process.env.SITE_BASE ?? '/',
  trailingSlash: 'always',
  vite: {
    // Three.js is one ~600 kB chunk, loaded with a dynamic import after first paint.
    build: { chunkSizeWarningLimit: 700 },
  },
});
